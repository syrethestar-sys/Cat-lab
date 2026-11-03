// Browser only: this file runs TensorFlow.js, so import it from Client Components
// (with a dynamic import) and never from a server file.
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
      resolve(c);
    };
    img.onerror = () => reject(new Error("Could not load one of your photos."));
    img.src = url;
  });
}

function toTensor(c: HTMLCanvasElement, flip = false) {
  const t = tf.browser.fromPixels(c).toFloat().div(255);
  return flip ? tf.reverse(t, 1) : t;
}

function buildModel() {
  const m = tf.sequential();
  m.add(
    tf.layers.conv2d({
      inputShape: [SIZE, SIZE, 3],
      filters: 8,
      kernelSize: 3,
      activation: "relu",
      padding: "same",
    }),
  );
  m.add(tf.layers.maxPooling2d({ poolSize: 2 }));
  m.add(
    tf.layers.conv2d({
      filters: 16,
      kernelSize: 3,
      activation: "relu",
      padding: "same",
    }),
  );
  m.add(tf.layers.maxPooling2d({ poolSize: 2 }));
  m.add(
    tf.layers.conv2d({
      filters: 32,
      kernelSize: 3,
      activation: "relu",
      padding: "same",
    }),
  );
  m.add(tf.layers.globalAveragePooling2d({}));
  m.add(tf.layers.dense({ units: 32, activation: "relu" }));
  m.add(tf.layers.dropout({ rate: 0.3 }));
  m.add(tf.layers.dense({ units: 1, activation: "sigmoid" })); // near 1 = cat, near 0 = not cat
  m.compile({
    optimizer: tf.train.adam(0.003),
    loss: "binaryCrossentropy",
    metrics: ["accuracy"],
  });
  return m;
}

// One round = one full pass over the photos. Reports after every round.
// Saves the trained model to IndexedDB and returns the accuracy of the last round (0 to 1).
export async function train(
  photos: { url: string; label: "cat" | "not_cat" }[],
  rounds: number,
  onRound: (round: number, accuracy: number) => void,
) {
  const canvases = await Promise.all(photos.map((p) => loadPixels(p.url)));
  // Every photo is used twice: as is and mirrored. More examples from the same photos.
  const xs = tf.tidy(() =>
    tf.stack([
      ...canvases.map((c) => toTensor(c)),
      ...canvases.map((c) => toTensor(c, true)),
    ]),
  );
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
    model.dispose();
  }
  return accuracy;
}

// Throws if no model has been saved yet.
export function loadModel() {
  return tf.loadLayersModel(MODEL_URL);
}

// p is 0 to 1: near 1 = cat, near 0 = not cat, 0.5 = can't decide.
export function predict(model: tf.LayersModel, canvas: HTMLCanvasElement) {
  const p = tf.tidy(
    () =>
      (model.predict(toTensor(canvas).expandDims(0)) as tf.Tensor).dataSync()[0],
  );
  const isCat = p >= 0.5;
  return {
    guess: isCat ? ("cat" as const) : ("not_cat" as const),
    sure: Math.round((isCat ? p : 1 - p) * 100),
  };
}
