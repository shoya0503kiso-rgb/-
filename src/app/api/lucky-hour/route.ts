import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { acquireLock, checkPin, DOC_KEYS, holderSchema, issueSyncKey, pinSchema, setPin, view, writeDoc } from "@/server/lucky-hour";
import { UserError } from "@/server/errors";

// ログイン不要の公開API（ミニゲーム「ラッキーアワー」の共有データ）。読み取りは誰でも、書き込みはスタッフPIN
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

const actionInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("setPin"), pin: pinSchema }),
  z.object({ action: z.literal("check"), pin: pinSchema }),
  z.object({ action: z.literal("set"), pin: pinSchema, key: z.enum(DOC_KEYS), value: z.unknown() }),
  z.object({ action: z.literal("lock"), pin: pinSchema, holder: holderSchema, ttlMs: z.number().int().positive() }),
  z.object({ action: z.literal("issueSyncKey"), pin: pinSchema }),
]);

function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "";
}

async function handle(fn: () => Promise<unknown>) {
  try {
    return NextResponse.json((await fn()) ?? { ok: true }, { headers: noStore });
  } catch (e) {
    if (e instanceof UserError) {
      const pinProblem = /PIN/.test(e.message) || /15分間/.test(e.message);
      return NextResponse.json({ error: e.message, needPin: pinProblem }, { status: pinProblem ? 401 : 400, headers: noStore });
    }
    throw e;
  }
}

export async function GET(req: NextRequest) {
  const v = Number(req.nextUrl.searchParams.get("v"));
  const since = req.nextUrl.searchParams.has("v") && Number.isInteger(v) ? v : undefined;
  return handle(() => view(since));
}

export async function POST(req: NextRequest) {
  const parsed = actionInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const pinIssue = parsed.error.issues.some(i => i.path[0] === "pin");
    return NextResponse.json({ error: pinIssue ? "PINは数字4〜8桁です" : "送信内容が正しくありません", needPin: pinIssue }, { status: pinIssue ? 401 : 400, headers: noStore });
  }
  const a = parsed.data;
  const ip = clientIp(req);
  switch (a.action) {
    case "setPin": return handle(() => setPin(a.pin));
    case "check": return handle(() => checkPin(a.pin, ip));
    case "set": return handle(async () => { await checkPin(a.pin, ip); return writeDoc(a.key, a.value); });
    case "lock": return handle(async () => { await checkPin(a.pin, ip); return acquireLock(a.holder, a.ttlMs); });
    case "issueSyncKey": return handle(async () => { await checkPin(a.pin, ip); return issueSyncKey(); });
  }
}
