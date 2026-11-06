import { randomUUID } from "node:crypto";
import { storage } from "@/app/_lib/storage";

// Keeps a copy of a trained model in Storage (private bucket, under models/).
// The browser sends the two files TensorFlow.js makes: model.json and model.weights.bin.
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const json = form?.get("model.json");
  const weights = form?.get("model.weights.bin");
  if (!(json instanceof File) || !(weights instanceof File)) {
    return Response.json({ error: "Send model.json and model.weights.bin" }, { status: 400 });
  }

  const folder = `models/${randomUUID()}`;
  const up = async (name: string, file: File, type: string) =>
    storage.upload(`${folder}/${name}`, Buffer.from(await file.arrayBuffer()), { contentType: type });
  const [a, b] = await Promise.all([
    up("model.json", json, "application/json"),
    up("model.weights.bin", weights, "application/octet-stream"),
  ]);
  if (a.error || b.error) {
    return Response.json({ error: "Could not store the model" }, { status: 500 });
  }
  return Response.json({ path: folder }, { status: 201 });
}
