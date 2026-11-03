import { db } from "@/app/_lib/db";

export async function POST(request: Request) {
  const { rounds, accuracy, modelUrl } = await request.json().catch(() => ({}));

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

  const run = await db.trainingRun.create({
    data: { rounds, accuracy, modelUrl },
  });
  return Response.json(run, { status: 201 });
}
