// Browser only: this file runs TensorFlow.js, so import it from Client Components
// (with a dynamic import) and never from a server file.
//
// How it works (a "baby" model, learned from zero):
//   1. Each photo is shrunk to 64 × 64 pixels. 64 × 64 pixels × 3 colors = 12,288 numbers.
//   2. The model starts with random numbers inside. It knows nothing about cats.
//   3. Three "look" layers slide small pattern detectors (3 × 3 pixels) over the photo.
//      The first layer finds simple things (edges, colors), later layers combine them.
//   4. Each round it guesses every training photo, checks your label, and nudges its
//      numbers a little toward the right answer.
// The whole model is saved to IndexedDB. Nothing is downloaded from outside.
import * as tf from "@tensorflow/tfjs";
import { MODEL_NAME } from "./saved-model";

export const SIZE = 64; // the model looks at 64 × 64 pixel photos
export const MODEL_URL = `indexeddb://${MODEL_NAME}`;
const HOLD_BACK = 0.2; // share of photos kept aside to measure real accuracy
const LOOKS = ["look1", "look2", "look3"]; // names of the 3 pattern-finding layers
const SHOW_MAPS = 8; // feature maps shown per layer

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

// Shrink a photo to a 64 × 64 canvas, cropped to a square.
function shrink(img: HTMLImageElement) {
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  const s = Math.min(img.naturalWidth, img.naturalHeight);
  // willReadFrequently: the pixels are read back right away (for the model and the screen).
  c.getContext("2d", { willReadFrequently: true })!.drawImage(
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

// Load a photo link into a 64 × 64 canvas, cropped to a square.
export async function loadPixels(url: string): Promise<HTMLCanvasElement> {
  return shrink(await loadImage(url));
}

function mirrored(c: HTMLCanvasElement) {
  const m = document.createElement("canvas");
  m.width = m.height = SIZE;
  const ctx = m.getContext("2d", { willReadFrequently: true })!;
  ctx.translate(SIZE, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(c, 0, 0);
  return m;
}

// Pixels as numbers from 0 to 1, shape [64, 64, 3].
function toTensor(c: HTMLCanvasElement): tf.Tensor3D {
  return tf.tidy(() => tf.browser.fromPixels(c).toFloat().div<tf.Tensor3D>(255));
}

function compile(m: tf.LayersModel) {
  m.compile({
    optimizer: tf.train.adam(0.001),
    loss: "binaryCrossentropy",
    metrics: ["accuracy"],
  });
}

// A small CNN that starts from random numbers.
function buildModel() {
  const m = tf.sequential();
  [8, 16, 32].forEach((filters, i) => {
    m.add(
      tf.layers.conv2d({
        ...(i === 0 ? { inputShape: [SIZE, SIZE, 3] } : {}),
        name: LOOKS[i],
        filters, // how many pattern detectors this layer has
        kernelSize: 3, // each detector looks at 3 × 3 pixels at a time
        padding: "same",
        activation: "relu",
      }),
    );
    m.add(tf.layers.maxPooling2d({ poolSize: 2 })); // halve the size, keep the strongest signal
  });
  m.add(tf.layers.flatten());
  m.add(tf.layers.dropout({ rate: 0.4 }));
  m.add(tf.layers.dense({ units: 32, activation: "relu" }));
  m.add(tf.layers.dropout({ rate: 0.4 }));
  m.add(tf.layers.dense({ units: 1, activation: "sigmoid" })); // near 1 = cat, near 0 = not cat
  compile(m);
  return m;
}

// Is this a saved baby model? (Something else saved under the name is rejected.)
function isBaby(m: tf.LayersModel) {
  const shape = m.inputs[0].shape;
  return shape[1] === SIZE && shape[2] === SIZE && shape[3] === 3 && LOOKS.every((n) => {
    try {
      return !!m.getLayer(n);
    } catch {
      return false;
    }
  });
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

// Loads the model saved in this browser, ready to train more.
async function loadSaved() {
  let m: tf.LayersModel;
  try {
    m = await tf.loadLayersModel(MODEL_URL);
  } catch {
    throw new Error("There is no saved model to keep teaching. Pick Start fresh.");
  }
  if (!isBaby(m)) {
    m.dispose();
    throw new Error("The saved model is from an older version. Pick Start fresh.");
  }
  compile(m); // a loaded model has no optimizer, so set it up again
  return m;
}

// ---- What the model looks like inside, for the screen ----

// One small picture: width × width pixels, RGBA bytes.
export type Picture = { width: number; data: Uint8ClampedArray };

export type Inside = {
  filters: Picture[]; // the 8 first-layer pattern detectors, 3 × 3 colored pixels each
  change: number; // how much the detectors changed since before round 1 (0.25 = 25%)
  maps: { size: number; total: number; pictures: Picture[] }[]; // what each look layer sees in one photo
};

// Stretch numbers to 0–255 so the smallest is black and the biggest is white.
function stretch(values: ArrayLike<number>) {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < values.length; i++) {
    lo = Math.min(lo, values[i]);
    hi = Math.max(hi, values[i]);
  }
  const range = hi - lo || 1;
  return (v: number) => ((v - lo) / range) * 255;
}

// The first layer's detector numbers: kernel shape [3, 3, 3 colors, 8 filters].
function kernelOf(m: tf.LayersModel) {
  const kernel = m.getLayer(LOOKS[0]).getWeights()[0];
  return { shape: kernel.shape as number[], w: kernel.dataSync() as Float32Array };
}

// Average size of the change, compared with the average size of the starting numbers.
function changeSince(start: Float32Array, now: Float32Array) {
  let diff = 0;
  let size = 0;
  for (let i = 0; i < start.length; i++) {
    diff += Math.abs(now[i] - start[i]);
    size += Math.abs(start[i]);
  }
  return size ? diff / size : 0;
}

function readFilters(m: tf.LayersModel): Picture[] {
  const { shape, w } = kernelOf(m);
  const [kh, kw, ch, n] = shape;
  const out: Picture[] = [];
  for (let f = 0; f < n; f++) {
    const vals: number[] = [];
    for (let i = 0; i < kh * kw * ch; i++) vals.push(w[i * n + f]);
    const s = stretch(vals);
    const data = new Uint8ClampedArray(kh * kw * 4);
    for (let p = 0; p < kh * kw; p++) {
      data[p * 4] = s(vals[p * ch]);
      data[p * 4 + 1] = s(vals[p * ch + 1]);
      data[p * 4 + 2] = s(vals[p * ch + 2]);
      data[p * 4 + 3] = 255;
    }
    out.push({ width: kw, data });
  }
  return out;
}

// What each look layer finds in one photo: one gray picture per detector (white = found it).
function readMaps(spy: tf.LayersModel, photo: tf.Tensor3D): Inside["maps"] {
  const outs = tf.tidy(() => spy.predict(photo.expandDims(0)) as tf.Tensor[]);
  try {
    return outs.map((t) => {
      const [, size, , total] = t.shape as number[];
      const v = t.dataSync();
      const pictures: Picture[] = [];
      for (let f = 0; f < Math.min(SHOW_MAPS, total); f++) {
        const vals = new Float32Array(size * size);
        for (let p = 0; p < size * size; p++) vals[p] = v[p * total + f];
        const s = stretch(vals);
        const data = new Uint8ClampedArray(size * size * 4);
        for (let p = 0; p < size * size; p++) {
          const g = s(vals[p]);
          data[p * 4] = data[p * 4 + 1] = data[p * 4 + 2] = g;
          data[p * 4 + 3] = 255;
        }
        pictures.push({ width: size, data });
      }
      return { size, total, pictures };
    });
  } finally {
    outs.forEach((t) => t.dispose());
  }
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
      stage: "pixels";
      done: number;
      total: number;
      photo: {
        url: string; // the photo as uploaded
        pixels: HTMLCanvasElement; // shrunk to 64 × 64
        mirror: HTMLCanvasElement; // flipped, an extra example
      };
    }
  | { stage: "split"; train: number; heldOut: number }
  // Before round 1: the detectors are still random. spy = the photo used to show what it sees.
  | { stage: "start"; spy: HTMLCanvasElement; inside: Inside }
  | { stage: "round"; round: number; accuracy: number; valAccuracy: number | null; inside: Inside }
  | { stage: "save" };

// One round = one full pass over the training photos.
// keepLearning: start from the model saved in this browser instead of a new random one.
// Saves the model to IndexedDB.
export async function train(
  photos: { id: string; url: string; label: "cat" | "not_cat" }[],
  rounds: number,
  keepLearning: boolean,
  onEvent: (e: TrainEvent) => void,
): Promise<TrainResult> {
  const total = photos.length;
  // Fail early (before the slow part) if there is nothing to keep teaching.
  let model: tf.LayersModel | null = keepLearning ? await loadSaved() : null;
  let spy: tf.LayersModel | null = null;
  const tensors: tf.Tensor[] = [];

  try {
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

    // Stage 2: shrink each photo to 64 × 64 pixels.
    const canvases: HTMLCanvasElement[] = [];
    for (let i = 0; i < total; i++) {
      canvases.push(shrink(images[i]));
      onEvent({ stage: "shrink", done: i + 1, total });
    }
    await tf.nextFrame();

    // Stage 3: every photo, and its mirror image, becomes 12,288 numbers (0 to 1).
    const px: tf.Tensor3D[] = [];
    const mirrorPx: tf.Tensor3D[] = [];
    for (let i = 0; i < total; i++) {
      const mirror = mirrored(canvases[i]);
      px.push(toTensor(canvases[i]));
      mirrorPx.push(toTensor(mirror));
      onEvent({
        stage: "pixels",
        done: i + 1,
        total,
        photo: { url: photos[i].url, pixels: canvases[i], mirror },
      });
      if (i % 10 === 9) await tf.nextFrame(); // let the screen update
    }
    tensors.push(...px, ...mirrorPx);

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

    const xs = tf.stack([...trainIdx.map((i) => px[i]), ...trainIdx.map((i) => mirrorPx[i])]);
    const ys = tf.tensor2d([...trainIdx.map(y), ...trainIdx.map(y)], [trainIdx.length * 2, 1]);
    const vxs = vIdx.length ? tf.stack(vIdx.map((i) => px[i])) : null;
    const vys = vIdx.length ? tf.tensor2d(vIdx.map(y), [vIdx.length, 1]) : null;
    tensors.push(xs, ys, ...(vxs ? [vxs] : []), ...(vys ? [vys] : []));

    // Stage 5: learn. A new random model, or the saved one.
    model = model ?? buildModel();
    const m = model;
    // The "spy" shows what each look layer sees in one photo it never trains on (if any).
    const spyIndex = vIdx[0] ?? 0;
    spy = tf.model({ inputs: m.inputs, outputs: LOOKS.map((n) => m.getLayer(n).output as tf.SymbolicTensor) });
    const s = spy;
    const startKernel = kernelOf(m).w.slice(); // a copy: the detectors before round 1
    const look = (): Inside => ({
      filters: readFilters(m),
      change: changeSince(startKernel, kernelOf(m).w),
      maps: readMaps(s, px[spyIndex]),
    });
    onEvent({ stage: "start", spy: canvases[spyIndex], inside: look() });
    await tf.nextFrame();

    let accuracy = 0;
    let valAccuracy: number | null = null;
    await m.fit(xs, ys, {
      epochs: rounds,
      batchSize: 16,
      shuffle: true,
      validationData: vxs && vys ? [vxs, vys] : undefined,
      callbacks: {
        onEpochEnd: async (epoch, logs) => {
          accuracy = Number(logs?.acc ?? logs?.accuracy ?? 0);
          const v = logs?.val_acc ?? logs?.val_accuracy;
          valAccuracy = v === undefined ? null : Number(v);
          onEvent({ stage: "round", round: epoch + 1, accuracy, valAccuracy, inside: look() });
          await tf.nextFrame(); // let the screen update
        },
      },
    });

    // Stage 6: the model now lives in IndexedDB.
    onEvent({ stage: "save" });
    await m.save(MODEL_URL);
    return { accuracy, valAccuracy, heldOut: vIdx.length };
  } finally {
    tensors.forEach((t) => t.dispose());
    model?.dispose(); // also frees the spy, which shares its layers
  }
}

// Throws if nothing usable is saved (nothing saved, or saved by an older version of this app).
export async function loadModel() {
  const m = await tf.loadLayersModel(MODEL_URL);
  if (!isBaby(m)) {
    m.dispose();
    throw new Error("The saved model is from an older version. Train it again.");
  }
  return m;
}

// p is 0 to 1: near 1 = cat, near 0 = not cat, 0.5 = can't decide.
export async function predict(model: tf.LayersModel, canvas: HTMLCanvasElement) {
  const p = tf.tidy(
    () => (model.predict(toTensor(canvas).expandDims(0)) as tf.Tensor).dataSync()[0],
  );
  const isCat = p >= 0.5;
  return {
    guess: isCat ? ("cat" as const) : ("not_cat" as const),
    sure: Math.round((isCat ? p : 1 - p) * 100),
  };
}

// Guess many photos with one model, telling the screen after each photo.
export async function predictMany(
  model: tf.LayersModel,
  urls: string[],
  onProgress?: (done: number, total: number) => void,
) {
  const results: Awaited<ReturnType<typeof predict>>[] = [];
  for (let i = 0; i < urls.length; i++) {
    results.push(await predict(model, await loadPixels(urls[i])));
    onProgress?.(i + 1, urls.length);
    await tf.nextFrame(); // let the screen update
  }
  return results;
}
