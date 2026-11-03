import { NextResponse, type NextRequest } from "next/server";
import { leaderboard, scoreInput, submitScore } from "@/server/dealer-quest";
import { UserError } from "@/server/errors";

// ログイン不要の公開API（ミニゲームのランキング）
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const playerId = req.nextUrl.searchParams.get("playerId") ?? undefined;
  const valid = playerId && /^[A-Za-z0-9-]{16,64}$/.test(playerId) ? playerId : undefined;
  return NextResponse.json(await leaderboard(valid), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = scoreInput.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "記録が正しくありません" }, { status: 400 });
  try {
    const ip = (req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0] ?? "").trim().slice(0, 64);
    const result = await submitScore(parsed.data, ip);
    return NextResponse.json({ ...result, ...(await leaderboard(parsed.data.playerId)) });
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
