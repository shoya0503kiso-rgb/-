import { prisma } from "@/server/db";

// 仮ロゴ（ロゴ画像が届くまでの代わり。管理画面「設定 → 見た目」でアップロードすると差し替わる）
const PLACEHOLDER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
<circle cx="100" cy="100" r="96" fill="#fff1f2" stroke="#fb7185" stroke-width="6"/>
<ellipse cx="100" cy="118" rx="62" ry="46" fill="#ffffff" stroke="#fda4af" stroke-width="4"/>
<circle cx="80" cy="112" r="6" fill="#334155"/><circle cx="120" cy="112" r="6" fill="#334155"/>
<path d="M90 126 q10 9 20 0" stroke="#334155" stroke-width="4" fill="none" stroke-linecap="round"/>
<circle cx="66" cy="126" r="7" fill="#fecdd3"/><circle cx="134" cy="126" r="7" fill="#fecdd3"/>
<text x="100" y="58" text-anchor="middle" font-size="26" font-weight="700" fill="#e11d48" font-family="sans-serif">MOCHI</text>
</svg>`;

export async function GET() {
  const s = await prisma.storeSetting.findUnique({ where: { id: 1 }, select: { logoData: true } });
  const m = s?.logoData?.match(/^data:([^;]+);base64,(.+)$/);
  if (m) {
    return new Response(Buffer.from(m[2], "base64"), {
      headers: { "Content-Type": m[1], "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=31536000, immutable" },
    });
  }
  return new Response(PLACEHOLDER, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=300" } });
}
