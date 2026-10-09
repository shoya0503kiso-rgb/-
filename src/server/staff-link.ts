// 従業員本人専用リンク（LINEで送る）。従業員ID・用途・期限を HMAC で署名する（P-17）
import { createHmac, timingSafeEqual } from "node:crypto";

export type StaffLinkPurpose = "submit" | "me";

const TTL_DAYS: Record<StaffLinkPurpose, number> = { submit: 30, me: 7 };

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET を32文字以上で設定してください");
  return s;
}

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sign = (payload: string) => createHmac("sha256", secret()).update(`staff-link:${payload}`).digest("base64url");

export function createStaffToken(employeeId: string, purpose: StaffLinkPurpose, now = new Date()) {
  const exp = Math.floor(now.getTime() / 1000) + TTL_DAYS[purpose] * 86400;
  const payload = b64(JSON.stringify({ e: employeeId, p: purpose, x: exp }));
  return `${payload}.${sign(payload)}`;
}

export function verifyStaffToken(token: string, purpose: StaffLinkPurpose, now = new Date()): string | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { e: string; p: string; x: number };
    if (data.p !== purpose || data.x * 1000 < now.getTime()) return null;
    return data.e;
  } catch {
    return null;
  }
}

export function staffUrl(employeeId: string, purpose: StaffLinkPurpose, now = new Date()) {
  const base = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/${purpose === "submit" ? "s" : "me"}/${createStaffToken(employeeId, purpose, now)}`;
}
