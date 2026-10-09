// LINE Messaging API アダプタ。アクセストークン未設定時はモック（送信せず記録のみ）。
import { createHmac, timingSafeEqual } from "node:crypto";

const API = "https://api.line.me/v2/bot";

export type LineMessage = { type: "text"; text: string };

export function isLineConfigured() {
  return !!process.env.LINE_CHANNEL_ACCESS_TOKEN;
}

/** X-Line-Signature の検証 */
export function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  let given: Buffer;
  try {
    given = Buffer.from(signature, "base64");
  } catch {
    return false;
  }
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** LINE のテキストは最大5000文字 */
export function text(t: string): LineMessage {
  return { type: "text", text: t.length > 5000 ? t.slice(0, 4990) + "…" : t };
}

async function call(path: string, body: unknown) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`LINE API ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

export interface SendResult {
  mocked: boolean;
}

export async function reply(replyToken: string, messages: LineMessage[]): Promise<SendResult> {
  if (!isLineConfigured()) {
    if (!process.env.VITEST) console.info("[LINE mock reply]", messages.map((m) => m.text).join(" / "));
    return { mocked: true };
  }
  await call("/message/reply", { replyToken, messages: messages.slice(0, 5) });
  return { mocked: false };
}

export async function push(to: string, messages: LineMessage[]): Promise<SendResult> {
  if (!isLineConfigured()) {
    if (!process.env.VITEST) console.info(`[LINE mock push to ${to}]`, messages.map((m) => m.text).join(" / "));
    return { mocked: true };
  }
  await call("/message/push", { to, messages: messages.slice(0, 5) });
  return { mocked: false };
}

export async function getProfileName(userId: string): Promise<string> {
  if (!isLineConfigured()) return "";
  try {
    const res = await fetch(`${API}/profile/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` },
    });
    if (!res.ok) return "";
    return String(((await res.json()) as { displayName?: string }).displayName ?? "");
  } catch {
    return "";
  }
}
