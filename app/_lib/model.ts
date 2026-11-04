// Browser only: this file runs TensorFlow.js, so import it from Client Components
// (with a dynamic import) and never from a server file.
//
// How it works (transfer learning):
//   1. MobileNet, trained by Google on millions of photos, turns every photo into
//      1,280 numbers that describe what is in it. We do not train MobileNet.
//   2. We train a small classifier on those numbers: "cat" (1) or "not cat" (0).
//   3. Only the small classifier is saved to IndexedDB. MobileNet is downloaded
//      again by the browser when needed (it caches it).
import * as tf from "@tensorflow/tfjs";
import * as mobilenet from "@tensorflow-models/mobilenet";

export const SIZE = 224; // MobileNet looks at 224 × 224 pixel photos
export const MODEL_URL = "indexeddb://cat-lab-model";
const EMBEDDING_SIZE = 1280; // numbers MobileNet v2 gives per photo
const HOLD_BACK = 0.2; // share of photos kept aside to measure real accuracy

let basePromise: Promise<mobilenet.MobileNet> | null = null;
function getBase() {
  if (!basePromise) {
    basePromise = mobilenet.load({ version: 2, alpha: 1.0 }).catch((e) => {
      basePromise = null; // allow a retry after a network error
      throw new Error(
        "Could not download MobileNet. Check your internet connection and try again.",
      );
    });
  }
  return basePromise;
}

// Download a photo from its link.
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // needed to read the pixels
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load one of your photos."));
    img.src = url;
  });
}

// Shrink a photo to a 224 × 224 canvas, cropped to a square.
function shrink(img: HTMLImageElement) {
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  const s = Math.min(img.naturalWidth, img.naturalHeight);
  c.getContext("2d")!.drawImage(
    img,
    (img.naturalWidth - s) / 2,
    (img.naturalHeight - s) / 2,
    s,
    s,
    0,
    0,
    SIZE,
    SIZE,
  );
  return c;
}

// Load a photo link into a 224 × 224 canvas, cropped to a square.
export async function loadPixels(url: string): Promise<HTMLCanvasElement> {
  return shrink(await loadImage(url));
}

function mirrored(c: HTMLCanvasElement) {
  const m = document.createElement("canvas");
  m.width = m.height = SIZE;
  const ctx = m.getContext("2d")!;
  ctx.translate(SIZE, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(c, 0, 0);
  return m;
}

async function embed(base: mobilenet.MobileNet, canvas: HTMLCanvasElement) {
  const t = tf.tidy(() => base.infer(canvas, true));
  const values = await t.data();
  t.dispose();
  return values as Float32Array;
}

function buildHead() {
  const m = tf.sequential();
  m.add(
    tf.layers.dense({
      inputShape: [EMBEDDING_SIZE],
      units: 64,
      activation: "relu",
      kernelRegularizer: tf.regularizers.l2({ l2: 0.01 }),
    }),
  );
  m.add(tf.layers.dropout({ rate: 0.4 }));
  m.add(tf.layers.dense({ units: 1, activation: "sigmoid" })); // near 1 = cat, near 0 = not cat
  m.compile({
    optimizer: tf.train.adam(0.001),
    loss: "binaryCrossentropy",
    metrics: ["accuracy"],
  });
  return m;
}

// The same photo is always held back (or always used for training), run after run.
// That keeps "photos it never saw" honest when the model keeps learning.
// FNV-1a hash of the photo id, turned into a number from 0 to 1.
function idScore(id: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 2 ** 32;
}

// Loads the classifier saved in this browser, ready to train more.
async function loadHead() {
  let head: tf.LayersModel;
  try {
    head = await tf.loadLayersModel(MODEL_URL);
  } catch {
    throw new Error("There is no saved model to keep teaching. Pick Start fresh.");
  }
  if (head.inputs[0].shape[1] !== EMBEDDING_SIZE) {
    head.dispose();
    throw new Error("The saved model is from an older version. Pick Start fresh.");
  }
  // A loaded model has no optimizer, so set it up again with the same settings.
  head.compile({
    optimizer: tf.train.adam(0.001),
    loss: "binaryCrossentropy",
    metrics: ["accuracy"],
  });
  return head;
}

export type TrainResult = {
  accuracy: number; // on the photos it trained on, last round (0 to 1)
  valAccuracy: number | null; // on photos it never saw, last round (null if none were held back)
  heldOut: number; // how many photos were kept aside
};

// What train() is doing right now, in order, so the screen can show it.
export type TrainEvent =
  | { stage: "load"; done: number; total: number }
  | { stage: "shrink"; done: number; total: number }
  | {
      stage: "numbers";
      done: number;
      total: number;
      photo: {
        url: string; // the photo as uploaded
        pixels: HTMLCanvasElement; // shrunk to 224 × 224
        mirror: HTMLCanvasElement; // flipped, an extra example
        numbers: Float32Array; // the 1,280 numbers MobileNet made from it
      };
    }
  | { stage: "split"; train: number; heldOut: number }
  | { stage: "round"; round: number; accuracy: number; valAccuracy: number | null }
  | { stage: "save" };

// One round = one full pass over the training photos.
// keepLearning: start from the classifier saved in this browser instead of a new one.
// Saves the small classifier to IndexedDB.
export async function train(
  photos: { id: string; url: string; label: "cat" | "not_cat" }[],
  rounds: number,
  keepLearning: boolean,
  onEvent: (e: TrainEvent) => void,
): Promise<TrainResult> {
  const total = photos.length;
  // Fail early (before the slow part) if there is nothing to keep teaching.
  const startHead = keepLearning ? await loadHead() : null;
  let head: tf.LayersModel | null = startHead;

  try {
    const base = await getBase();

    // Stage 1: download every photo.
    let loaded = 0;
    onEvent({ stage: "load", done: 0, total });
    const images = await Promise.all(
      photos.map((p) =>
        loadImage(p.url).then((img) => {
          onEvent({ stage: "load", done: ++loaded, total });
          return img;
        }),
      ),
    );

    // Stage 2: shrink each photo to 224 × 224 pixels, the size MobileNet reads.
    const canvases: HTMLCanvasElement[] = [];
    for (let i = 0; i < total; i++) {
      canvases.push(shrink(images[i]));
      onEvent({ stage: "shrink", done: i + 1, total });
    }
    await tf.nextFrame();

    // Stage 3: MobileNet turns the pixels of every photo, and its mirror image, into numbers.
    const feats: Float32Array[] = [];
    const mirrorFeats: Float32Array[] = [];
    for (let i = 0; i < total; i++) {
      const mirror = mirrored(canvases[i]);
      feats.push(await embed(base, canvases[i]));
      mirrorFeats.push(await embed(base, mirror));
      onEvent({
        stage: "numbers",
        done: i + 1,
        total,
        photo: { url: photos[i].url, pixels: canvases[i], mirror, numbers: feats[i] },
      });
      await tf.nextFrame(); // let the screen update
    }

    // Stage 4: keep about 20% of each group aside. Mirror copies stay with their photo.
    // Only photos whose id score is under 0.2 can be held back, lowest first, and at most
    // 20% of the group (small groups can get many low scores by chance).
    // A group with fewer than 5 photos needs all of them to learn from.
    const valIdx = new Set<number>();
    for (const label of ["cat", "not_cat"] as const) {
      const idx = photos.map((_, i) => i).filter((i) => photos[i].label === label);
      if (idx.length < 5) continue;
      const cap = Math.max(1, Math.round(idx.length * HOLD_BACK));
      idx
        .map((i) => ({ i, score: idScore(photos[i].id) }))
        .filter((p) => p.score < HOLD_BACK)
        .sort((a, b) => a.score - b.score)
        .slice(0, cap)
        .forEach((p) => valIdx.add(p.i));
    }
    const trainIdx = photos.map((_, i) => i).filter((i) => !valIdx.has(i));
    const vIdx = [...valIdx];
    onEvent({ stage: "split", train: trainIdx.length, heldOut: vIdx.length });
    const y = (i: number) => (photos[i].label === "cat" ? 1 : 0);

    const xs = tf.tensor2d(
      [...trainIdx.map((i) => feats[i]), ...trainIdx.map((i) => mirrorFeats[i])].map((f) => Array.from(f)),
      [trainIdx.length * 2, EMBEDDING_SIZE],
    );
    const ys = tf.tensor2d([...trainIdx.map(y), ...trainIdx.map(y)], [trainIdx.length * 2, 1]);
    const vxs = vIdx.length ? tf.tensor2d(vIdx.map((i) => Array.from(feats[i])), [vIdx.length, EMBEDDING_SIZE]) : null;
    const vys = vIdx.length ? tf.tensor2d(vIdx.map(y), [vIdx.length, 1]) : null;

    // Stage 5: train the small classifier on those numbers (a new one, or the saved one).
    head = startHead ?? buildHead();
    let accuracy = 0;
    let valAccuracy: number | null = null;
    try {
      await head.fit(xs, ys, {
        epochs: rounds,
        batchSize: 16,
        shuffle: true,
        validationData: vxs && vys ? [vxs, vys] : undefined,
        callbacks: {
          onEpochEnd: async (epoch, logs) => {
            accuracy = Number(logs?.acc ?? logs?.accuracy ?? 0);
            const v = logs?.val_acc ?? logs?.val_accuracy;
            valAccuracy = v === undefined ? null : Number(v);
            onEvent({ stage: "round", round: epoch + 1, accuracy, valAccuracy });
            await tf.nextFrame(); // let the screen update
          },
        },
      });
      // Stage 6: the classifier now lives in IndexedDB.
      onEvent({ stage: "save" });
      await head.save(MODEL_URL);
    } finally {
      xs.dispose();
      ys.dispose();
      vxs?.dispose();
      vys?.dispose();
    }
    return { accuracy, valAccuracy, heldOut: vIdx.length };
  } finally {
    head?.dispose();
  }
}

// Throws if nothing usable is saved (nothing saved, or saved by the older version of this app).
export async function loadModel() {
  const head = await tf.loadLayersModel(MODEL_URL);
  if (head.inputs[0].shape[1] !== EMBEDDING_SIZE) {
    head.dispose();
    throw new Error("The saved model is from an older version. Train it again.");
  }
  await getBase(); // download MobileNet now, so the first guess is fast
  return head;
}

// p is 0 to 1: near 1 = cat, near 0 = not cat, 0.5 = can't decide.
export async function predict(head: tf.LayersModel, canvas: HTMLCanvasElement) {
  const base = await getBase();
  const p = tf.tidy(
    () => (head.predict(base.infer(canvas, true)) as tf.Tensor).dataSync()[0],
  );
  const isCat = p >= 0.5;
  return {
    guess: isCat ? ("cat" as const) : ("not_cat" as const),
    sure: Math.round((isCat ? p : 1 - p) * 100),
  };
}

// Guess many photos with one model, telling the screen after each photo.
export async function predictMany(
  head: tf.LayersModel,
  urls: string[],
  onProgress?: (done: number, total: number) => void,
) {
  const results: Awaited<ReturnType<typeof predict>>[] = [];
  for (let i = 0; i < urls.length; i++) {
    results.push(await predict(head, await loadPixels(urls[i])));
    onProgress?.(i + 1, urls.length);
    await tf.nextFrame(); // let the screen update
  }
  return results;
}
