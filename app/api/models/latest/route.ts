import { db } from "@/app/_lib/db";
import { SIGNED_LINK_SECONDS, storage } from "@/app/_lib/storage";

// Links to the newest model copy kept in Storage (see POST /api/models), valid 1 hour.
export async function GET() {
  const run = await db.trainingRun.findFirst({
    where: { modelUrl: { startsWith: "models/" } },
    orderBy: { createdAt: "desc" },
  });
  if (!run) return Response.json({ error: "No model is saved on the server yet." }, { status: 404 });

  const { data } = await storage.createSignedUrls(
    [`${run.modelUrl}/model.json`, `${run.modelUrl}/model.weights.bin`],
    SIGNED_LINK_SECONDS,
  );
  const [json, weights] = data ?? [];
  if (!json?.signedUrl || !weights?.signedUrl) {
    return Response.json({ error: "Could not reach the saved model." }, { status: 500 });
  }
  return Response.json({ jsonUrl: json.signedUrl, weightsUrl: weights.signedUrl });
}
