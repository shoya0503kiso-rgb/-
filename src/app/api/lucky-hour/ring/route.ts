import { NextResponse, type NextRequest } from "next/server";
import { checkSyncKey, ringEvent, ringInput } from "@/server/lucky-hour";
import { UserError } from "@/server/errors";

// 箱カルテなど外部のシステムから、リングの入退店を受け取る（Authorization: Bearer <連携キー>）
//   {"action":"enter","id":"カルテID","name":"表示名"}  リングに入った
//   {"action":"leave","id":"カルテID"}                  リングを退店した
//   {"action":"sync","members":[{"id":"…","name":"…"}]}  いまリングにいる全員（いない人は外れる）
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function POST(req: NextRequest) {
  const key = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "";
  try {
    if (!key) throw new UserError("連携キーがありません");
    await checkSyncKey(key, ip);
    const parsed = ringInput.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "送信内容が正しくありません" }, { status: 400, headers: noStore });
    return NextResponse.json(await ringEvent(parsed.data), { headers: noStore });
  } catch (e) {
    if (e instanceof UserError) {
      const auth = /連携キー|15分間/.test(e.message);
      return NextResponse.json({ error: e.message }, { status: auth ? 401 : 400, headers: noStore });
    }
    throw e;
  }
}
