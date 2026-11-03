import { prisma } from "@/server/db";

// 管理画面「設定 → 見た目」でアップロードしたロゴ。未アップロードなら標準ロゴ（public/brand/logo-mark.png）
export async function GET(req: Request) {
  const s = await prisma.storeSetting.findUnique({ where: { id: 1 }, select: { logoData: true } });
  const m = s?.logoData?.match(/^data:([^;]+);base64,(.+)$/);
  if (m) {
    return new Response(Buffer.from(m[2], "base64"), {
      headers: { "Content-Type": m[1], "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=31536000, immutable" },
    });
  }
  return Response.redirect(new URL("/brand/logo-mark.png", req.url), 307);
}
