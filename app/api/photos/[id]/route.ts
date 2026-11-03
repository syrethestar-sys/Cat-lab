import { db } from "@/app/_lib/db";
import { storage } from "@/app/_lib/storage";

export async function DELETE(
  _req: Request,
  ctx: RouteContext<"/api/photos/[id]">,
) {
  const { id } = await ctx.params; // params is a Promise in Next.js 16
  const photo = await db.photo.findUnique({ where: { id } });
  if (!photo) return Response.json({ error: "Not found" }, { status: 404 });

  await storage.remove([photo.storagePath]);
  await db.photo.delete({ where: { id } });
  return new Response(null, { status: 204 });
}
