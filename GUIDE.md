# Cat Lab build guide

This guide takes the app from what it does now (upload and label photos, kept in browser memory) to the full 8-step flow.
Do one step at a time. Finish its **Check it** list before you start the next step.

```
TRAINING GROUND                                   TESTING GROUND
1 Upload photos   → Supabase Storage              5 Load the model   → tf.loadLayersModel()
2 Label each one  → Prisma Photo.label            6 Add a new photo  (never used in training)
3 Train           → TensorFlow.js, in browser     7 Model guesses    → model.predict()
4 Save the model  → model.json to Storage   ───►  8 Show the answer  → "Cat, 87% sure"
```

The app keeps its 4 screens. This is where each guide step lives:

| App screen | Guide steps |
| --- | --- |
| 1 Upload | 1 |
| 2 Label | 2 |
| 3 Train | 3, 4 |
| 4 Test | 5, 6, 7, 8 |

Versions used in this guide: Next.js 16.4, Prisma 7.10, `@supabase/supabase-js` 2.x, `@tensorflow/tfjs` 4.22.

---

## Step 0: Setup

**Goal:** the app can talk to your Supabase project and its database.

### 0.1 Install packages

```bash
npm install @supabase/supabase-js @tensorflow/tfjs@4.22.0 @prisma/client@7.10.1 @prisma/adapter-pg@7.10.1 dotenv
npm install -D prisma@7.10.1
```

Pin Prisma to `7.10.1`. The `latest` tag on npm can point to a release candidate.

### 0.2 Environment variables

Create `.env.local` in the project root. It is already in `.gitignore`, so it won't be committed.

```bash
# Supabase dashboard → Project Settings → API
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-or-publishable-key

# Supabase dashboard → Connect → "Session pooler" connection string
DATABASE_URL=postgresql://postgres.YOUR-PROJECT:YOUR-PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres
```

Variables that start with `NEXT_PUBLIC_` are sent to the browser. Never put the `service_role` key in one.

### 0.3 Storage buckets

In Supabase → **Storage**, create two **public** buckets:

- `photos`: the photos students upload
- `models`: the trained model files

Then in **SQL Editor**, run this so the browser can upload, overwrite and delete files:

```sql
create policy "cat lab insert" on storage.objects
  for insert to anon with check (bucket_id in ('photos', 'models'));
create policy "cat lab update" on storage.objects
  for update to anon using (bucket_id in ('photos', 'models'));
create policy "cat lab select" on storage.objects
  for select to anon using (bucket_id in ('photos', 'models'));
create policy "cat lab delete" on storage.objects
  for delete to anon using (bucket_id in ('photos', 'models'));
```

> These rules let anyone with the app change these two buckets. That is fine for a class demo, but not for a real app. A real app adds login (Supabase Auth) first.

### 0.4 Prisma

```bash
npx prisma init
```

This creates `prisma/schema.prisma` and `prisma.config.ts`.

Edit **`prisma.config.ts`** so Prisma reads `.env.local`:

```ts
import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

config({ path: ".env.local" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("DATABASE_URL") },
});
```

Replace **`prisma/schema.prisma`** with:

```prisma
generator client {
  provider = "prisma-client"
  output   = "../app/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

model Photo {
  id        String   @id @default(cuid())
  path      String   // file path inside the "photos" bucket
  url       String   // public URL, used by <img> and by training
  label     String?  // "cat", "not", or null = not labeled yet
  split     String   @default("train") // "train" or "test"
  createdAt DateTime @default(now())
}
```

Create the table and the client:

```bash
npx prisma migrate dev --name init
npx prisma generate
```

Add the generated folder to `.gitignore`:

```
/app/generated/
```

### 0.5 Shared helpers

**`app/_lib/supabase.ts`** (used in the browser):

```ts
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
```

**`app/_lib/db.ts`** (server only):

```ts
import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/app/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Reuse one client while `next dev` hot-reloads.
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
```

Run `npm install server-only` if it isn't installed yet.

### Check it

- [ ] `npx prisma studio` opens and shows an empty **Photo** table.
- [ ] Supabase → Storage shows the `photos` and `models` buckets, both marked Public.
- [ ] `npx tsc --noEmit` passes.

---

# Training ground

## Step 1: Upload photos → Supabase Storage

**Goal:** a chosen photo is stored in the `photos` bucket and gets a row in the `Photo` table, so it is still there after a reload.

### Server functions

Create **`app/_lib/actions.ts`**. Every export is a Server Function the client can call:

```ts
"use server";

import { db } from "./db";

export async function addPhoto(path: string, url: string) {
  const p = await db.photo.create({ data: { path, url } });
  return { id: p.id, url: p.url, label: null };
}

export async function deletePhoto(id: string) {
  await db.photo.delete({ where: { id } });
}
```

### Load saved photos on the page

In **`app/page.tsx`**, read the photos on the server and pass them to `CatLab`. With Cache Components on (see `next.config.ts`), a database read must be inside `<Suspense>` and after `await connection()`:

```tsx
import { connection } from "next/server";
import { Suspense } from "react";
import CatLab from "./_components/CatLab";
import { db } from "./_lib/db";

async function SavedPhotos() {
  await connection(); // read the database on every request
  const photos = await db.photo.findMany({ orderBy: { createdAt: "asc" } });
  return (
    <CatLab
      initialPhotos={photos.map((p) => ({
        id: p.id,
        url: p.url,
        label: p.label as "cat" | "not" | null,
      }))}
    />
  );
}

export default function Home() {
  return (
    <main className="mx-auto flex max-w-[860px] flex-col gap-8 px-4 pt-8 pb-20">
      {/* keep the existing header here */}
      <Suspense fallback={<p className="text-center text-muted">Loading your photos…</p>}>
        <SavedPhotos />
      </Suspense>
    </main>
  );
}
```

### Upload in `CatLab.tsx`

1. Change `Photo.id` from `number` to `string`, and remove `nextId`.
2. Take a prop: `{ initialPhotos }: { initialPhotos: Photo[] }`, then `useState<Photo[]>(initialPhotos)`.
3. Replace `addFiles` and `removePhoto`:

```ts
import { supabase } from "../_lib/supabase";
import { addPhoto, deletePhoto } from "../_lib/actions";

async function addFiles(files: File[]) {
  const images = files.filter((f) => f.type.startsWith("image/"));
  setSkipped(files.length - images.length);
  for (const file of images) {
    const path = `${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage.from("photos").upload(path, file);
    if (error) { setError(error.message); continue; }
    const url = supabase.storage.from("photos").getPublicUrl(path).data.publicUrl;
    const photo = await addPhoto(path, url);
    setPhotos((ps) => [...ps, photo]);
  }
  changed();
}

async function removePhoto(id: string) {
  const p = photos.find((x) => x.id === id);
  if (!p) return;
  const path = decodeURIComponent(p.url.split("/photos/")[1]);
  await supabase.storage.from("photos").remove([path]);
  await deletePhoto(id);
  setPhotos((ps) => ps.filter((x) => x.id !== id));
  changed();
}
```

4. Add `const [error, setError] = useState("")` and show it under the upload box in `text-red`.
5. Upload goes straight from the browser to Supabase, so big photos never pass through a Server Function. Server Functions accept 1 MB by default.

### Check it (Chrome DevTools)

- [ ] Upload 2 photos. The **Network** tab shows a `POST` to `…supabase.co/storage/v1/object/photos/…` with status 200 for each.
- [ ] Supabase → Storage → `photos` lists both files.
- [ ] `npx prisma studio` shows 2 rows with `label` empty.
- [ ] Reload the page. Both photos are still there.
- [ ] Remove one. It disappears from the bucket and from the table.
- [ ] **Console** has no errors.

---

## Step 2: Label each one → Prisma `Photo.label`

**Goal:** clicking Cat or Not cat saves the label, so it survives a reload.

Add to **`app/_lib/actions.ts`**:

```ts
export async function setPhotoLabel(id: string, label: "cat" | "not") {
  await db.photo.update({ where: { id }, data: { label } });
}
```

In **`CatLab.tsx`**, update the screen first so it feels instant, then save:

```ts
function setLabel(id: string, label: Label) {
  setPhotos((ps) => ps.map((p) => (p.id === id ? { ...p, label } : p)));
  changed();
  setPhotoLabel(id, label).catch(() => setError("Could not save that label. Try again."));
}
```

### Check it

- [ ] Label 1 photo Cat and 1 Not cat. Each click sends one request (a `POST` to `/` with a `Next-Action` header in the Network tab).
- [ ] Prisma Studio shows `cat` and `not` in the `label` column.
- [ ] Reload. The page reopens on Step 1, and after Next the labels are still set.

---

## Step 3: Train → TensorFlow.js, in the browser

**Goal:** "Start training" trains a small model on the labeled photos, and the screen shows the round, progress and accuracy.

### Hold some photos back for testing

The model must never see test photos while training, or the test score means nothing. Add to **`actions.ts`**:

```ts
export async function saveSplit(testIds: string[]) {
  await db.photo.updateMany({ data: { split: "train" } });
  await db.photo.updateMany({ where: { id: { in: testIds } }, data: { split: "test" } });
}
```

### The model code

Create **`app/_lib/model.ts`**. This is the only file that imports TensorFlow.js.

```ts
import * as tf from "@tensorflow/tfjs";

export const SIZE = 64;   // photos are shrunk to 64 × 64 pixels
export const ROUNDS = 10; // one round = a few passes over all photos

// Load a photo URL into a 64 × 64 canvas, cropped to a square.
export function loadPixels(url: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // needed to read pixels from Supabase
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = c.height = SIZE;
      const s = Math.min(img.naturalWidth, img.naturalHeight);
      c.getContext("2d")!.drawImage(
        img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, SIZE, SIZE,
      );
      resolve(c);
    };
    img.onerror = () => reject(new Error(`Could not load ${url}`));
    img.src = url;
  });
}

function toTensor(c: HTMLCanvasElement, flip = false) {
  const t = tf.browser.fromPixels(c).toFloat().div(255);
  return flip ? tf.reverse(t, 1) : t;
}

export function buildModel() {
  const m = tf.sequential();
  m.add(tf.layers.conv2d({ inputShape: [SIZE, SIZE, 3], filters: 8, kernelSize: 3, activation: "relu", padding: "same" }));
  m.add(tf.layers.maxPooling2d({ poolSize: 2 }));
  m.add(tf.layers.conv2d({ filters: 16, kernelSize: 3, activation: "relu", padding: "same" }));
  m.add(tf.layers.maxPooling2d({ poolSize: 2 }));
  m.add(tf.layers.conv2d({ filters: 32, kernelSize: 3, activation: "relu", padding: "same" }));
  m.add(tf.layers.globalAveragePooling2d({}));
  m.add(tf.layers.dense({ units: 32, activation: "relu" }));
  m.add(tf.layers.dropout({ rate: 0.3 }));
  m.add(tf.layers.dense({ units: 1, activation: "sigmoid" })); // 1 = cat, 0 = not cat
  m.compile({ optimizer: tf.train.adam(0.003), loss: "binaryCrossentropy", metrics: ["accuracy"] });
  return m;
}

// Train and report after every round: round number and accuracy (0 to 1).
export async function train(
  photos: { url: string; label: "cat" | "not" }[],
  onRound: (round: number, accuracy: number) => void,
) {
  const canvases = await Promise.all(photos.map((p) => loadPixels(p.url)));
  // Each photo is used twice: as is and mirrored. More examples, same photos.
  const xs = tf.tidy(() => tf.stack([...canvases.map((c) => toTensor(c)), ...canvases.map((c) => toTensor(c, true))]));
  const labels = photos.map((p) => (p.label === "cat" ? 1 : 0));
  const ys = tf.tensor2d([...labels, ...labels], [labels.length * 2, 1]);

  const model = buildModel();
  for (let round = 1; round <= ROUNDS; round++) {
    const h = await model.fit(xs, ys, { epochs: 4, batchSize: 16, shuffle: true });
    const acc = h.history.acc ?? h.history.accuracy;
    onRound(round, Number(acc.at(-1)));
  }
  xs.dispose();
  ys.dispose();
  return model;
}
```

### Wire it into Screen 3

In **`CatLab.tsx`**:

1. Add state: `const [rounds, setRounds] = useState<number[]>([])`, `const [training, setTraining] = useState(false)`, and a ref for the model: `const modelRef = useRef<LayersModel | null>(null)`.
2. On "Start training":

```ts
async function startTraining() {
  setTraining(true);
  setRounds([]);
  // Keep 1 in 5 of each group for testing (only if the group has 3 or more).
  const testIds: string[] = [];
  for (const label of ["cat", "not"] as const) {
    const group = photos.filter((p) => p.label === label).sort(() => Math.random() - 0.5);
    const keep = group.length >= 3 ? Math.max(1, Math.floor(group.length / 5)) : 0;
    testIds.push(...group.slice(0, keep).map((p) => p.id));
  }
  await saveSplit(testIds);
  const trainSet = photos.filter((p) => !testIds.includes(p.id)) as { url: string; label: Label }[];
  const { train } = await import("../_lib/model"); // load TensorFlow.js only when needed
  modelRef.current = await train(trainSet, (round, acc) => setRounds((r) => [...r, acc]));
  setTraining(false);
}
```

3. Show the parts you already have:
   - `MainButton big onClick={startTraining}` with "Start training" (locked and saying "Training…" while `training` is true)
   - Round: `{rounds.length} / 10`
   - `<ProgressBar value={rounds.length * 10} label="Training progress" />`
   - `<AccuracyChart />`: change it to take `values: number[]` and draw the line from them instead of the fixed path
4. Next ("Next: Test the model") unlocks when `rounds.length === 10`.

### Check it

- [ ] Use at least 5 cats and 5 not cats. Click Start training.
- [ ] The round counter goes 1 → 10 and the progress bar fills.
- [ ] The accuracy line grows after each round.
- [ ] **Console** has no errors. A CORS error means the bucket is not public (see 0.3).
- [ ] Prisma Studio shows some photos with `split = test`.
- [ ] The page stays usable while training. If it freezes, lower `epochs` in `train()`.

---

## Step 4: Save the model → `model.json` to Storage

**Goal:** after training, the model is saved as two files in the `models` bucket, so the Testing ground can load it later.

TensorFlow.js saves a model as `model.json` (its layers) plus `weights.bin` (what it learned). Add to **`model.ts`**:

```ts
import { supabase } from "./supabase";

const FOLDER = "cat-model";

export async function saveModel(model: tf.LayersModel) {
  await model.save(
    tf.io.withSaveHandler(async (artifacts) => {
      const weights = tf.io.CompositeArrayBuffer.join(artifacts.weightData!);
      const json = {
        modelTopology: artifacts.modelTopology,
        format: artifacts.format,
        generatedBy: artifacts.generatedBy,
        weightsManifest: [{ paths: ["weights.bin"], weights: artifacts.weightSpecs }],
      };
      const bucket = supabase.storage.from("models");
      const opts = { upsert: true, cacheControl: "0" }; // overwrite, don't cache old versions
      const a = await bucket.upload(`${FOLDER}/model.json`, new Blob([JSON.stringify(json)], { type: "application/json" }), opts);
      const b = await bucket.upload(`${FOLDER}/weights.bin`, new Blob([weights]), opts);
      if (a.error || b.error) throw a.error ?? b.error;
      return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: "JSON" } };
    }),
  );
}
```

Call it at the end of `startTraining()`: `await saveModel(modelRef.current)`. Then show "Model saved" under the chart.

### Check it

- [ ] After training, Supabase → Storage → `models/cat-model/` has `model.json` and `weights.bin`.
- [ ] Open the public URL of `model.json` in a new tab. It shows JSON with `"weightsManifest"`.
- [ ] Train again. Both files are replaced, not duplicated.

---

# Testing ground

Screen 4 does steps 5 to 8. It loads **the saved model** instead of reusing the one in memory. That proves the save worked and that the Testing ground doesn't depend on the Training ground being open.

## Step 5: Load the model → `tf.loadLayersModel()`

Add to **`model.ts`**:

```ts
export async function loadModel() {
  const url = supabase.storage.from("models").getPublicUrl(`${FOLDER}/model.json`).data.publicUrl;
  return tf.loadLayersModel(`${url}?v=${Date.now()}`); // ?v= skips the browser cache
}
```

In `CatLab.tsx`, when Screen 4 opens, run `loadModel()` once and keep the result in a ref. Show "Loading the model…" until it is ready, and an error in `text-red` if it fails.

### Check it

- [ ] The Network tab shows `model.json` and then `weights.bin`, both with status 200.
- [ ] Reload the page, go back to Screen 4, and the model loads again without retraining.

## Step 6: Add a new photo (never used in training)

Reuse `UploadBox` with one file at a time. **Don't** upload this photo to Supabase or save it in Prisma. Test photos must never join the training set.

```ts
async function guessFile(file: File) {
  const url = URL.createObjectURL(file); // local only
  const canvas = await loadPixels(url);
  setGuess({ url, ...predict(modelRef.current!, canvas) });
}
```

For the score at the top of Screen 4, also run the model on photos with `split = "test"` and show each one with `ResultTile` and a "5 / 6 test photos right" score. Those photos were kept out of training in Step 3.

## Step 7: Model guesses → `model.predict()`

Add to **`model.ts`**:

```ts
export function predict(model: tf.LayersModel, canvas: HTMLCanvasElement) {
  const p = tf.tidy(() => (model.predict(toTensor(canvas).expandDims(0)) as tf.Tensor).dataSync()[0]);
  const isCat = p >= 0.5;
  return { guess: isCat ? "cat" : "not", sure: Math.round((isCat ? p : 1 - p) * 100) } as const;
}
```

`p` is a number from 0 to 1. Near 1 means "cat", near 0 means "not cat", and 0.5 means the model can't decide.

## Step 8: Show the answer → "Cat, 87% sure"

Change **`GuessPanel`** to take `src: string` instead of `icon` and `tone`, and show the photo with `<img src={src} …>`. Then:

```tsx
{guess && <GuessPanel src={guess.url} guess={guess.guess} sure={guess.sure} />}
```

### Check it (steps 5 to 8)

- [ ] Screen 4 shows the test score, and each test photo is marked Right (green) or Wrong (red).
- [ ] Upload a cat photo the model has never seen. It shows "A cat" and a sure %.
- [ ] Upload a non-cat. It shows "Not a cat".
- [ ] No new file shows up in the `photos` bucket after testing.
- [ ] **Console** has no errors.

---

## When something breaks

| You see | Likely cause | Fix |
| --- | --- | --- |
| `new row violates row-level security policy` on upload | Storage policies missing | Run the SQL in 0.3 |
| CORS / "tainted canvas" error while training | Bucket not public, or missing `img.crossOrigin` | Make the bucket public; keep `crossOrigin = "anonymous"` |
| `Cannot find module '@/app/generated/prisma/client'` | Client not generated | `npx prisma generate` |
| `DATABASE_URL` is undefined in Prisma commands | Prisma doesn't read `.env.local` on its own | Check the `config({ path: ".env.local" })` line in `prisma.config.ts` |
| Dev overlay says **blocking-route** | Database read outside `<Suspense>` | Keep `SavedPhotos` inside `<Suspense>` (Step 1) |
| Accuracy stays around 50% | Too few or too similar photos | Add 10+ of each group with different backgrounds |
| Accuracy is 100% but the test score is bad | The model memorized the training photos | Add more photos, or use fewer rounds |
