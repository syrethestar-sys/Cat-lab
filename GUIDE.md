# Cat Lab build guide

This guide follows the six Cat Lab diagrams: How it flows, Who does what, Upload a photo, Label a photo, Train and test, Database tables.
Do one step at a time. Finish its **Check it** list before you start the next step.

## The plan in one picture

```
BROWSER (student's computer)        OUR SERVER (Next.js)            CLOUD (Supabase)
────────────────────────────        ────────────────────            ────────────────
Pages: 4 screens (React+Tailwind)   API routes: check each request  Postgres: rows (photos, training_runs)
TensorFlow.js: train + guess        Prisma: TypeScript → SQL        Storage: bucket "photos" (the files)
IndexedDB: the saved model          Secret keys live here only
```

- **Photos and labels go through our server.** The browser never talks to Supabase directly, so the secret key never reaches the browser.
- **Training and guessing happen in the browser.** The trained model is saved in the browser's IndexedDB, not in Supabase.
- **Rows go to Postgres, files go to Storage.** A row keeps only the file's path.

| App screen | Guide step | What happens |
| --- | --- | --- |
| 1 Upload | Step 1 | `POST /api/photos` |
| 2 Label | Step 2 | `PATCH /api/photos/[id]` |
| 3 Train | Step 3 | train, save model to IndexedDB, `POST /api/training-runs` |
| 4 Test | Step 4 | load model from IndexedDB, upload a test photo, guess, show the answer |

Versions used: Next.js 16.4, Prisma 7.10, `@supabase/supabase-js` 2.x, `@tensorflow/tfjs` 4.22.

---

## Step 0: Setup

**Goal:** the server can reach your Supabase database and Storage, and the two tables from the diagram exist.

### What is already done

- Packages installed: `@supabase/supabase-js`, `@tensorflow/tfjs`, `@prisma/client`, `@prisma/adapter-pg`, `prisma`, `dotenv`.
- `.env.local` has `DATABASE_URL` and `DIRECT_URL` with your real password.
- `prisma.config.ts` reads `.env.local` and uses `DIRECT_URL` for migrations.
- A first migration created a `Photo` table. Step 0.2 replaces it with the diagram's tables.

> Run every Prisma command with `--config prisma.config.ts` until you delete the extra file `prisma7.config.ts`. Prisma picks that file first, and it uses the wrong connection string.

### 0.1 Secret key and private bucket

1. Supabase → **Project Settings → API Keys**. Copy the **service_role** key (or the **secret** key).
2. Add to `.env.local`. Note: no `NEXT_PUBLIC_` in front. This key must never reach the browser.

   ```bash
   SUPABASE_SERVICE_ROLE_KEY=your-secret-key
   ```

3. Supabase → **Storage → New bucket** → name `photos` → keep **Public bucket OFF**.
4. You do **not** need access rules (SQL policies). Only our server, with the secret key, can read or write the bucket. Photos are shown through signed links that expire after 1 hour.
5. You do **not** need a `models` bucket. The model lives in the browser.

### 0.2 Database tables

Replace `prisma/schema.prisma` with:

```prisma
generator client {
  provider = "prisma-client"
  output   = "../app/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

model Photo {
  id          String   @id @default(uuid())
  storagePath String   @unique // where the file is in Storage, e.g. training/abc.jpg
  label       String? // "cat", "not_cat", or null = not labeled yet
  ground      String   @default("training") // "training" or "testing"
  createdAt   DateTime @default(now())

  @@map("photos")
}

model TrainingRun {
  id        String   @id @default(uuid())
  rounds    Int // how many rounds the model learned
  accuracy  Float // 0 to 1, after the last round
  modelUrl  String // "indexeddb://cat-lab-model"
  createdAt DateTime @default(now())

  @@map("training_runs")
}
```

Apply it:

```bash
npx prisma migrate dev --name diagram_tables --config prisma.config.ts
```

The old `Photo` table was empty, so if Prisma warns about data loss, say yes.

Then turn on row-level security. Supabase's public Data API would otherwise let anyone with the anon key read and change these tables:

```bash
npx prisma migrate dev --create-only --name enable_rls --config prisma.config.ts
```

Put this in the new `migration.sql`, then run `npx prisma migrate dev --config prisma.config.ts`:

```sql
ALTER TABLE "photos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "training_runs" ENABLE ROW LEVEL SECURITY;
```

With no policies, only the server can reach the tables. Prisma connects as the table owner, so the app keeps working. Check that `npx prisma generate --config prisma.config.ts` ran.

### 0.3 Server helpers

Delete `app/_lib/supabase.ts`. It used the public key in the browser, and we don't need that any more. Create **`app/_lib/storage.ts`**:

```ts
import "server-only";
import { createClient } from "@supabase/supabase-js";

// Secret key: this file must never be imported by a Client Component.
export const storage = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
).storage.from("photos");

export const SIGNED_LINK_SECONDS = 60 * 60; // links last 1 hour
```

### 0.4 Database certificate

Node does not trust Supabase's database certificate by default, so the app fails with `SELF_SIGNED_CERT_IN_CHAIN`. Give it the certificate:

1. Supabase → **Database → Settings → SSL Configuration → Download certificate**.
2. Save it as `certs/supabase-ca.crt` in the project. It is a public certificate, so it is safe to commit.
3. Update **`app/_lib/db.ts`**:

```ts
import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/app/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({
      // The adapter ignores Prisma's ?pgbouncer=true flag, so drop it.
      connectionString: process.env.DATABASE_URL!.replace(/[?&]pgbouncer=true/, ""),
      ssl: { ca: readFileSync(join(process.cwd(), "certs/supabase-ca.crt"), "utf8") },
    }),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
```

### Check it

- [ ] `npx prisma studio --config prisma.config.ts` shows empty `photos` and `training_runs` tables.
- [ ] Supabase → Storage shows a **private** `photos` bucket.
- [ ] `npx tsc --noEmit` passes.
- [ ] `.env.local` has `SUPABASE_SERVICE_ROLE_KEY`, and `git status` does not list `.env.local`.

---

## Step 1: Upload photos

**Goal:** `POST /api/photos` stores the file in Storage, saves a row, and returns the photo with a 1-hour link. After a reload, the photos come back.

```
Student → Browser → POST /api/photos → ApiRoute → Storage (upload file)
                                               → Prisma → Postgres (INSERT INTO photos)
                                               → Storage (make a signed link, 1 hour)
        ← 201 photo + link ←
```

### The API route

Create **`app/api/photos/route.ts`**:

```ts
import { db } from "@/app/_lib/db";
import { SIGNED_LINK_SECONDS, storage } from "@/app/_lib/storage";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const GROUNDS = ["training", "testing"];

// Photos + links for one ground, oldest first.
export async function GET(request: Request) {
  const ground = new URL(request.url).searchParams.get("ground") ?? "training";
  if (!GROUNDS.includes(ground)) return Response.json({ error: "Unknown ground" }, { status: 400 });

  const rows = await db.photo.findMany({ where: { ground }, orderBy: { createdAt: "asc" } });
  const { data } = await storage.createSignedUrls(rows.map((r) => r.storagePath), SIGNED_LINK_SECONDS);
  const links = new Map(data?.map((d) => [d.path, d.signedUrl]));

  return Response.json(rows.map((r) => ({ id: r.id, label: r.label, ground: r.ground, url: links.get(r.storagePath) ?? "" })));
}

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  const ground = String(form.get("ground") ?? "training");

  // Check the request before talking to Supabase.
  if (!(file instanceof File)) return Response.json({ error: "Send a file" }, { status: 400 });
  if (!file.type.startsWith("image/")) return Response.json({ error: "Only image files" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "Photo is bigger than 5 MB" }, { status: 413 });
  if (!GROUNDS.includes(ground)) return Response.json({ error: "Unknown ground" }, { status: 400 });

  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const storagePath = `${ground}/${crypto.randomUUID()}.${ext}`; // e.g. training/abc.jpg

  const up = await storage.upload(storagePath, file, { contentType: file.type });
  if (up.error) return Response.json({ error: up.error.message }, { status: 502 });

  let photo;
  try {
    photo = await db.photo.create({ data: { storagePath, ground } });
  } catch {
    await storage.remove([storagePath]); // no row, so don't keep an orphan file
    return Response.json({ error: "Could not save the photo" }, { status: 500 });
  }

  const { data } = await storage.createSignedUrl(storagePath, SIGNED_LINK_SECONDS);
  return Response.json({ id: photo.id, label: photo.label, ground: photo.ground, url: data?.signedUrl ?? "" }, { status: 201 });
}
```

Route Handlers are not cached, so `GET` always reads fresh data.

### The delete route

Create **`app/api/photos/[id]/route.ts`**. Step 2 adds `PATCH` to this same file.

```ts
import { db } from "@/app/_lib/db";
import { storage } from "@/app/_lib/storage";

export async function DELETE(_req: Request, ctx: RouteContext<"/api/photos/[id]">) {
  const { id } = await ctx.params; // params is a Promise in Next.js 16
  const photo = await db.photo.findUnique({ where: { id } });
  if (!photo) return Response.json({ error: "Not found" }, { status: 404 });

  await storage.remove([photo.storagePath]);
  await db.photo.delete({ where: { id } });
  return new Response(null, { status: 204 });
}
```

### The screen (`CatLab.tsx`)

1. Change the photo type to `{ id: string; url: string; label: "cat" | "not_cat" | null }`. In `PhotoTile.tsx`, change the `Label` type to `"cat" | "not_cat"`, and the Not cat button and its border check to use `not_cat`.
2. Remove `nextId` and `URL.createObjectURL`. The photos now come from the server.
3. Load saved photos when the page opens:

```ts
useEffect(() => {
  fetch("/api/photos?ground=training")
    .then((r) => r.json())
    .then(setPhotos)
    .catch(() => setError("Could not load your photos."))
    .finally(() => setLoading(false));
}, []);
```

4. Upload each chosen file, then add the photo to the screen:

```ts
async function addFiles(files: File[]) {
  const images = files.filter((f) => f.type.startsWith("image/"));
  setSkipped(files.length - images.length);
  for (const file of images) {
    const body = new FormData();
    body.append("file", file);
    body.append("ground", "training");
    const res = await fetch("/api/photos", { method: "POST", body });
    if (!res.ok) { setError((await res.json()).error); continue; }
    setPhotos((ps) => [...ps, await res.json()]);
  }
  changed();
}

async function removePhoto(id: string) {
  const res = await fetch(`/api/photos/${id}`, { method: "DELETE" });
  if (res.ok) { setPhotos((ps) => ps.filter((p) => p.id !== id)); changed(); }
}
```

5. Add `const [error, setError] = useState("")` and `const [loading, setLoading] = useState(true)`. Show `error` in red under the upload box, and "Loading your photos…" while `loading` is true.

### Check it (Chrome DevTools)

- [ ] Choose 2 photos. **Network** shows `POST /api/photos` with status **201** for each.
- [ ] Open the response: it has `id`, `label: null`, `ground`, and a `url` that starts with your Supabase address and contains `token=`.
- [ ] Supabase → Storage → `photos/training/` lists both files. Prisma Studio shows 2 rows with the same paths.
- [ ] Reload. The photos are still there (`GET /api/photos?ground=training` returns 200).
- [ ] Open a photo's `url` in a new tab: it shows the picture. Try the bucket's plain public URL: it is refused, because the bucket is private.
- [ ] Choose a non-image file: the app shows an error and nothing is stored. **Console** has no unexpected errors.

---

## Step 2: Label each one

**Goal:** clicking Cat or Not cat sends `PATCH /api/photos/[id]` and the label is saved.

```
Student clicks Cat → Browser → PATCH /api/photos/abc → ApiRoute → Prisma photo.update
                                                    → Postgres UPDATE label
                   ← 200 OK ←                      ← Photo object ←
```

Add `PATCH` to **`app/api/photos/[id]/route.ts`**:

```ts
const LABELS = ["cat", "not_cat"];

export async function PATCH(request: Request, ctx: RouteContext<"/api/photos/[id]">) {
  const { id } = await ctx.params;
  const { label } = await request.json().catch(() => ({}));
  if (!LABELS.includes(label)) return Response.json({ error: "label must be cat or not_cat" }, { status: 400 });

  try {
    const photo = await db.photo.update({ where: { id }, data: { label } });
    return Response.json({ id: photo.id, label: photo.label });
  } catch {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
}
```

In **`CatLab.tsx`**, update the screen first so it feels instant, then save. If saving fails, put the old label back:

```ts
async function setLabel(id: string, label: Label) {
  const before = photos.find((p) => p.id === id)?.label ?? null;
  setPhotos((ps) => ps.map((p) => (p.id === id ? { ...p, label } : p)));
  changed();
  const res = await fetch(`/api/photos/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label }),
  });
  if (!res.ok) {
    setPhotos((ps) => ps.map((p) => (p.id === id ? { ...p, label: before } : p)));
    setError("Could not save that label. Try again.");
  }
}
```

### Check it

- [ ] Click Cat on one photo and Not cat on another. **Network** shows `PATCH /api/photos/<id>` with status **200** and request body `{"label":"cat"}`.
- [ ] Prisma Studio shows `cat` and `not_cat` in the `label` column.
- [ ] Reload and open Step 2. The labels are still set.
- [ ] Send a wrong label from the **Console**: `fetch("/api/photos/<id>", {method:"PATCH", body: JSON.stringify({label:"dog"})})` returns **400**.

---

## Step 3: Train → save the model

**Goal:** "Start training" loads the labeled photos, trains in the browser, saves the model to IndexedDB, and records the run.

```
Start training → GET labeled photos → Photos + links
              → TensorFlow.js learns N rounds → save model to IndexedDB
              → POST /api/training-runs → Prisma → Postgres (save run)
```

### Pick the number of rounds

Show three small buttons above Start training: **10**, **30** and **50** rounds. Keep `30` selected at first. More rounds usually score better but take longer.

### The model code

Create **`app/_lib/model.ts`**. Only this file imports TensorFlow.js, and only Client Components import this file.

```ts
import * as tf from "@tensorflow/tfjs";

export const SIZE = 64; // photos are shrunk to 64 × 64 pixels
export const MODEL_URL = "indexeddb://cat-lab-model";

// Load a photo link into a 64 × 64 canvas, cropped to a square.
export function loadPixels(url: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // needed to read the pixels
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = c.height = SIZE;
      const s = Math.min(img.naturalWidth, img.naturalHeight);
      c.getContext("2d")!.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, SIZE, SIZE);
      resolve(c);
    };
    img.onerror = () => reject(new Error("Could not load a photo"));
    img.src = url;
  });
}

function toTensor(c: HTMLCanvasElement, flip = false) {
  const t = tf.browser.fromPixels(c).toFloat().div(255);
  return flip ? tf.reverse(t, 1) : t;
}

function buildModel() {
  const m = tf.sequential();
  m.add(tf.layers.conv2d({ inputShape: [SIZE, SIZE, 3], filters: 8, kernelSize: 3, activation: "relu", padding: "same" }));
  m.add(tf.layers.maxPooling2d({ poolSize: 2 }));
  m.add(tf.layers.conv2d({ filters: 16, kernelSize: 3, activation: "relu", padding: "same" }));
  m.add(tf.layers.maxPooling2d({ poolSize: 2 }));
  m.add(tf.layers.conv2d({ filters: 32, kernelSize: 3, activation: "relu", padding: "same" }));
  m.add(tf.layers.globalAveragePooling2d({}));
  m.add(tf.layers.dense({ units: 32, activation: "relu" }));
  m.add(tf.layers.dropout({ rate: 0.3 }));
  m.add(tf.layers.dense({ units: 1, activation: "sigmoid" })); // near 1 = cat, near 0 = not cat
  m.compile({ optimizer: tf.train.adam(0.003), loss: "binaryCrossentropy", metrics: ["accuracy"] });
  return m;
}

// One round = one full pass over the photos. Reports after every round.
export async function train(
  photos: { url: string; label: "cat" | "not_cat" }[],
  rounds: number,
  onRound: (round: number, accuracy: number) => void,
) {
  const canvases = await Promise.all(photos.map((p) => loadPixels(p.url)));
  // Every photo is used twice: as is and mirrored. More examples from the same photos.
  const xs = tf.tidy(() => tf.stack([...canvases.map((c) => toTensor(c)), ...canvases.map((c) => toTensor(c, true))]));
  const labels = photos.map((p) => (p.label === "cat" ? 1 : 0));
  const ys = tf.tensor2d([...labels, ...labels], [labels.length * 2, 1]);

  const model = buildModel();
  let accuracy = 0;
  try {
    await model.fit(xs, ys, {
      epochs: rounds,
      batchSize: 16,
      shuffle: true,
      callbacks: {
        onEpochEnd: async (epoch, logs) => {
          accuracy = Number(logs?.acc ?? logs?.accuracy ?? 0);
          onRound(epoch + 1, accuracy);
          await tf.nextFrame(); // let the screen update
        },
      },
    });
    await model.save(MODEL_URL); // the model now lives in IndexedDB
  } finally {
    xs.dispose();
    ys.dispose();
    model.dispose(); // free memory; Step 4 loads the model back from IndexedDB
  }
  return accuracy;
}
```

### The run record

Create **`app/api/training-runs/route.ts`**:

```ts
import { db } from "@/app/_lib/db";

export async function POST(request: Request) {
  const { rounds, accuracy, modelUrl } = await request.json().catch(() => ({}));
  if (!Number.isInteger(rounds) || rounds < 1) return Response.json({ error: "rounds must be a whole number" }, { status: 400 });
  if (typeof accuracy !== "number" || accuracy < 0 || accuracy > 1) return Response.json({ error: "accuracy must be 0 to 1" }, { status: 400 });
  if (typeof modelUrl !== "string") return Response.json({ error: "modelUrl is required" }, { status: 400 });

  const run = await db.trainingRun.create({ data: { rounds, accuracy, modelUrl } });
  return Response.json(run, { status: 201 });
}
```

### Wire it into Screen 3 (`CatLab.tsx`)

```ts
async function startTraining() {
  setTraining(true); setHistory([]); setError("");
  try {
    // Ask the server for the labeled training photos and fresh links.
    const all: Photo[] = await (await fetch("/api/photos?ground=training")).json();
    const labeled = all.filter((p): p is Photo & { label: Label } => p.label !== null);

    const { train, MODEL_URL } = await import("../_lib/model"); // load TensorFlow.js only now
    const accuracy = await train(labeled, rounds, (_round, acc) => setHistory((h) => [...h, acc]));

    await fetch("/api/training-runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rounds, accuracy, modelUrl: MODEL_URL }),
    });
    setTrained(true);
  } catch (e) {
    setError(e instanceof Error ? e.message : "Training stopped.");
  } finally {
    setTraining(false);
  }
}
```

Show what the app already has: the **Round** counter `history.length / rounds`, `<ProgressBar value={(history.length / rounds) * 100} />`, and `<AccuracyChart values={history} rounds={rounds} />` (it now draws the line from `history`; the x axis runs to the number of rounds). **Next: Test the model** unlocks when `trained` is true.

### Check it

- [ ] Use at least 5 cats and 5 not cats. Pick 30 rounds and click Start training.
- [ ] The round counter goes up to 30, the bar fills, and the accuracy line grows.
- [ ] **Application → IndexedDB → tensorflowjs → models_store** has an entry `cat-lab-model`.
- [ ] **Network** shows `POST /api/training-runs` with status **201**. Prisma Studio shows a `training_runs` row with `rounds = 30` and `modelUrl = indexeddb://cat-lab-model`.
- [ ] **Console** has no errors. A "tainted canvas" error means a photo link was loaded without `crossOrigin = "anonymous"`.

---

## Step 4: Test with a new photo

**Goal:** load the saved model, upload a new photo, and show "Cat, 87% sure".

```
Add test photo → Load model from IndexedDB → Guess photo (TensorFlow.js) → 0.92 = Cat → Show answer
```

Loading from IndexedDB proves the model was really saved. It also means the Testing ground works after you reload the page, without training again.

### Load the model and guess

Add to **`app/_lib/model.ts`**:

```ts
export function loadModel() {
  return tf.loadLayersModel(MODEL_URL); // throws if nothing was saved yet
}

export function predict(model: tf.LayersModel, canvas: HTMLCanvasElement) {
  const p = tf.tidy(() => (model.predict(toTensor(canvas).expandDims(0)) as tf.Tensor).dataSync()[0]);
  const isCat = p >= 0.5; // p is 0 to 1: near 1 = cat, near 0 = not cat
  return { guess: isCat ? "cat" : "not_cat", sure: Math.round((isCat ? p : 1 - p) * 100) } as const;
}
```

### Save the test photo as `testing`

A test photo goes through the same `POST /api/photos`, but with `ground = "testing"`. Training only reads `ground = "training"`, so a test photo can never be used to train.

```ts
async function guessFile(file: File) {
  const body = new FormData();
  body.append("file", file);
  body.append("ground", "testing");
  const res = await fetch("/api/photos", { method: "POST", body });
  if (!res.ok) { setError((await res.json()).error); return; }
  const photo = await res.json();

  const { loadModel, loadPixels, predict } = await import("../_lib/model");
  const model = modelRef.current ?? (modelRef.current = await loadModel());
  const result = predict(model, await loadPixels(photo.url));
  setGuess({ url: photo.url, ...result });
}
```

Add `const modelRef = useRef<LayersModel | null>(null)` (import the `LayersModel` type from `@tensorflow/tfjs`). If `loadModel()` throws, show "Train the model first" with a Back button.

### Show the answer

Change **`GuessPanel`** to take `src: string` (the photo link) instead of `icon` and `tone`, and show `<img src={src} …>`. Then, on Screen 4:

```tsx
{guess && <GuessPanel src={guess.url} guess={guess.guess} sure={guess.sure} />}
```

`GuessPanel` already shows "A cat" or "Not a cat", the bar, and "It is 87% sure."

### Check it

- [ ] Reload the page, go to Step 4, and upload a cat photo the model never saw. **Network** shows `POST /api/photos` (201) with `ground = testing`.
- [ ] The screen shows "A cat" and a sure %. Upload a non-cat: it shows "Not a cat".
- [ ] Supabase → Storage → `photos/testing/` has the new files. Training later ignores them.
- [ ] Reload and go straight to Step 4 without training: the model still loads from IndexedDB.
- [ ] Clear it (Application → IndexedDB → delete `cat-lab-model`), upload a photo: the app says to train first and does not crash.
- [ ] **Console** has no errors.

---

## When something breaks

| You see | Likely cause | Fix |
| --- | --- | --- |
| `SELF_SIGNED_CERT_IN_CHAIN` in the terminal | Database certificate missing | Step 0.4 |
| `P1000 Authentication failed` | Placeholder or wrong password in `.env.local` | Reset the database password; check `.env.local`, not `.env` |
| Prisma connects to port 6543 | It loaded `prisma7.config.ts` | Add `--config prisma.config.ts`, or delete that file |
| `Invalid API key` / 401 from Storage | Wrong or missing `SUPABASE_SERVICE_ROLE_KEY` | Copy it again from Project Settings → API Keys, restart `npm run dev` |
| Photo tile is broken after an hour | The signed link expired | Reload the page; `GET /api/photos` makes new links |
| `413` on upload | Photo is over 5 MB | Use a smaller photo, or raise `MAX_BYTES` in the route |
| Tainted canvas / CORS error in training | Image loaded without `crossOrigin` | Keep `img.crossOrigin = "anonymous"` in `loadPixels` |
| Training freezes the page | Too many rounds or photos | Pick 10 rounds, or use fewer photos |
| Accuracy stays near 50% | Too few or too similar photos | Add 10+ of each group, with different backgrounds |
| Accuracy is 100% but guesses are wrong | The model memorized the training photos | Add more photos, or use fewer rounds |
