import { db } from "@/app/_lib/db";
import { SIGNED_LINK_SECONDS, storage } from "@/app/_lib/storage";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const GROUNDS = ["training", "testing"];

// Photos + links for one ground, oldest first.
export async function GET(request: Request) {
  const ground = new URL(request.url).searchParams.get("ground") ?? "training";
  if (!GROUNDS.includes(ground)) {
    return Response.json({ error: "Unknown ground" }, { status: 400 });
  }

  const rows = await db.photo.findMany({
    where: { ground },
    orderBy: { createdAt: "asc" },
  });
  const { data } = await storage.createSignedUrls(
    rows.map((r) => r.storagePath),
    SIGNED_LINK_SECONDS,
  );
  const links = new Map(data?.map((d) => [d.path, d.signedUrl]));

  return Response.json(
    rows.map((r) => ({
      id: r.id,
      label: r.label,
      ground: r.ground,
      url: links.get(r.storagePath) ?? "",
    })),
  );
}

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  const ground = String(form.get("ground") ?? "training");

  // Check the request before talking to Supabase.
  if (!(file instanceof File)) {
    return Response.json({ error: "Send a file" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return Response.json({ error: "Only image files" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "Photo is bigger than 5 MB" }, { status: 413 });
  }
  if (!GROUNDS.includes(ground)) {
    return Response.json({ error: "Unknown ground" }, { status: 400 });
  }

  const ext =
    file.name
      .split(".")
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "jpg";
  const storagePath = `${ground}/${crypto.randomUUID()}.${ext}`; // e.g. training/abc.jpg

  const up = await storage.upload(storagePath, file, { contentType: file.type });
  if (up.error) {
    return Response.json({ error: up.error.message }, { status: 502 });
  }

  let photo;
  try {
    photo = await db.photo.create({ data: { storagePath, ground } });
  } catch {
    await storage.remove([storagePath]); // no row, so don't keep an orphan file
    return Response.json({ error: "Could not save the photo" }, { status: 500 });
  }

  const { data } = await storage.createSignedUrl(storagePath, SIGNED_LINK_SECONDS);
  return Response.json(
    {
      id: photo.id,
      label: photo.label,
      ground: photo.ground,
      url: data?.signedUrl ?? "",
    },
    { status: 201 },
  );
}
