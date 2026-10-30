import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  backToLobby, battleInput, codeSchema, joinRoom, leaveRoom, roomView, saveBattle, settingsInput, startDrawing, submitDrawing, submitInput,
  tokenSchema, updateSettings,
} from "@/server/draw-battle";
import { UserError } from "@/server/errors";

// ログイン不要の公開API（ミニゲーム「お絵描きバトル」の部屋の様子と操作）
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };
const noStore = { "Cache-Control": "no-store" };

const actionInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("join"), token: tokenSchema.optional() }),
  z.object({ action: z.literal("leave"), token: tokenSchema, target: z.string().max(40).optional() }),
  z.object({ action: z.literal("settings"), token: tokenSchema, settings: settingsInput }),
  z.object({ action: z.literal("start"), token: tokenSchema }),
  z.object({ action: z.literal("submit"), token: tokenSchema, entry: submitInput }),
  z.object({ action: z.literal("battle"), token: tokenSchema, battle: battleInput }),
  z.object({ action: z.literal("again"), token: tokenSchema }),
]);

async function handle(fn: () => Promise<unknown>) {
  try {
    return NextResponse.json((await fn()) ?? { ok: true }, { headers: noStore });
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: 400, headers: noStore });
    throw e;
  }
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const code = codeSchema.safeParse((await ctx.params).code.toUpperCase());
  const token = tokenSchema.safeParse(req.nextUrl.searchParams.get("token"));
  if (!code.success || !token.success) return NextResponse.json({ error: "部屋が見つかりません" }, { status: 400 });
  const v = Number(req.nextUrl.searchParams.get("v"));
  const since = req.nextUrl.searchParams.has("v") && Number.isInteger(v) ? v : undefined;
  const joinUrl = `${req.nextUrl.origin}/drawing-battle?room=${code.data}`;
  return handle(() => roomView(code.data, token.data, since, joinUrl));
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const code = codeSchema.safeParse((await ctx.params).code.toUpperCase());
  const parsed = actionInput.safeParse(await req.json().catch(() => null));
  if (!code.success) return NextResponse.json({ error: "部屋が見つかりません" }, { status: 400 });
  if (!parsed.success) return NextResponse.json({ error: "送信内容が正しくありません" }, { status: 400 });
  const c = code.data;
  const a = parsed.data;
  switch (a.action) {
    case "join": return handle(() => joinRoom(c, a.token));
    case "leave": return handle(() => leaveRoom(c, a.token, a.target));
    case "settings": return handle(() => updateSettings(c, a.token, a.settings));
    case "start": return handle(() => startDrawing(c, a.token));
    case "submit": return handle(() => submitDrawing(c, a.token, a.entry));
    case "battle": return handle(() => saveBattle(c, a.token, a.battle));
    case "again": return handle(() => backToLobby(c, a.token));
  }
}
