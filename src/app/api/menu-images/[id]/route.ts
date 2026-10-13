import { db } from "@/lib/db";

export const runtime = "nodejs";

// Menu photographs are public so guests can view them without a staff session.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(id)) {
    return new Response(null, { status: 404 });
  }
  const image = await db.menuImage.findFirst({
    where: { id, menuItem: { isActive: true, category: { isActive: true } } },
    select: { content: true },
  });
  if (!image) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(new Uint8Array(image.content), {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(image.content.byteLength),
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}
