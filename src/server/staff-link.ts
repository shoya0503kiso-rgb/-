// 従業員本人専用リンク（LINEで送る）。従業員ID・用途・期限・世代を HMAC で署名する（P-17）
// 世代（Employee.linkVersion）は LINE 連携の変更・解除で上がり、発行済みリンクはすべて無効になる
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "./db";

export type StaffLinkPurpose = "submit" | "me";

const TTL_DAYS: Record<StaffLinkPurpose, number> = { submit: 30, me: 7 };

export interface LinkSubject {
  id: string;
  linkVersion: number;
}

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET を32文字以上で設定してください");
  return s;
}

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sign = (payload: string) => createHmac("sha256", secret()).update(`staff-link:${payload}`).digest("base64url");

/** expiresAt を渡すと、既定の有効期限との早い方になる（提出リンクは締切まで） */
export function createStaffToken(employee: LinkSubject, purpose: StaffLinkPurpose, now = new Date(), expiresAt?: Date) {
  let exp = Math.floor(now.getTime() / 1000) + TTL_DAYS[purpose] * 86400;
  if (expiresAt) exp = Math.min(exp, Math.floor(expiresAt.getTime() / 1000));
  const payload = b64(JSON.stringify({ e: employee.id, p: purpose, x: exp, v: employee.linkVersion }));
  return `${payload}.${sign(payload)}`;
}

/** 署名・用途・期限だけを確認（DBは見ない） */
export function verifyStaffToken(token: string, purpose: StaffLinkPurpose, now = new Date()): { employeeId: string; version: number } | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { e: string; p: string; x: number; v?: number };
    if (data.p !== purpose || data.x * 1000 < now.getTime()) return null;
    return { employeeId: data.e, version: data.v ?? 0 };
  } catch {
    return null;
  }
}

/** リンクの持ち主（在籍中・世代一致）を返す */
export async function resolveStaffToken(token: string, purpose: StaffLinkPurpose, now = new Date()) {
  const v = verifyStaffToken(token, purpose, now);
  if (!v) return null;
  const employee = await prisma.employee.findUnique({ where: { id: v.employeeId } });
  if (!employee || !employee.active || employee.linkVersion !== v.version) return null;
  return employee;
}

export function staffUrl(employee: LinkSubject, purpose: StaffLinkPurpose, now = new Date(), expiresAt?: Date) {
  const base = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/${purpose === "submit" ? "s" : "me"}/${createStaffToken(employee, purpose, now, expiresAt)}`;
}
