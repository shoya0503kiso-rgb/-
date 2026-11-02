import { NextResponse, type NextRequest } from "next/server";
import { createRoom } from "@/server/draw-battle";
import { UserError } from "@/server/errors";

// ログイン不要の公開API（ミニゲーム「お絵描きバトル」の部屋を作る）
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const ip = (req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0] ?? "").trim().slice(0, 64);
    return NextResponse.json(await createRoom(ip));
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
