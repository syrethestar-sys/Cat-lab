import { db } from "@/app/_lib/db";

export async function POST(request: Request) {
  const {
    rounds,
    accuracy,
    modelUrl,
    continued = false,
    model = "baby",
    photos = 0,
    heldOut = 0,
  } = await request.json().catch(() => ({}));

  if (!Number.isInteger(rounds) || rounds < 1) {
    return Response.json(
      { error: "rounds must be a whole number" },
      { status: 400 },
    );
  }
  if (typeof accuracy !== "number" || !(accuracy >= 0 && accuracy <= 1)) {
    return Response.json(
      { error: "accuracy must be 0 to 1" },
      { status: 400 },
    );
  }
  if (typeof modelUrl !== "string" || !modelUrl) {
    return Response.json({ error: "modelUrl is required" }, { status: 400 });
  }

  if (typeof continued !== "boolean") {
    return Response.json(
      { error: "continued must be true or false" },
      { status: 400 },
    );
  }

  if (!Number.isInteger(photos) || photos < 0 || !Number.isInteger(heldOut) || heldOut < 0 || heldOut > photos) {
    return Response.json({ error: "photos and heldOut must be whole numbers" }, { status: 400 });
  }

  // Only the baby model (learned from zero) is trained now. Older rows say "mobilenet".
  if (model !== "baby") {
    return Response.json({ error: 'model must be "baby"' }, { status: 400 });
  }

  const run = await db.trainingRun.create({
    data: { rounds, accuracy, modelUrl, continued, model, photos, heldOut },
  });
  return Response.json(run, { status: 201 });
}

// Score history: baby-model runs that measured accuracy on photos it never saw,
// oldest first, so the page can chart "photos used" against "right on new photos".
export async function GET() {
  const runs = await db.trainingRun.findMany({
    where: { model: "baby", heldOut: { gt: 0 } },
    orderBy: { createdAt: "asc" },
    select: { id: true, photos: true, heldOut: true, accuracy: true, rounds: true, continued: true },
  });
  return Response.json(runs);
}
