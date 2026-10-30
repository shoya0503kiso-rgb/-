import { prisma } from "@/server/db";

export async function GET() {
  const s = await prisma.storeSetting.findUnique({ where: { id: 1 }, select: { mochiSoundData: true } });
  const m = s?.mochiSoundData?.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return new Response("not found", { status: 404 });
  return new Response(Buffer.from(m[2], "base64"), {
    headers: { "Content-Type": m[1], "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
