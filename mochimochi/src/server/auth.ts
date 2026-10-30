import "server-only";
import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { UserError } from "./errors";
import { assertNotLocked, recordFailure } from "./rate-limit";
import { ADMIN_COOKIE, signAdminSession, verifyAdminSession, type AdminSession } from "./session-token";

const ADMIN_MAX_AGE = 60 * 60 * 24 * 14;

/** 接続元IP（リバースプロキシ経由を想定） */
export async function clientIp() {
  const h = await headers();
  // 送信元が書き換えられないヘッダーを優先（Vercel / 信頼できるリバースプロキシ）。
  // x-forwarded-for は先頭が偽装できるため、プロキシが付けた末尾を使う
  const trusted = h.get("x-vercel-forwarded-for") ?? h.get("x-real-ip");
  if (trusted) return trusted.split(",")[0].trim();
  return (h.get("x-forwarded-for")?.split(",").pop() ?? "").trim();
}

async function setAdminCookie(user: { id: string; name: string; tokenVersion: number; mustChangePassword: boolean }) {
  const token = await signAdminSession(
    { adminId: user.id, name: user.name, ver: user.tokenVersion, mustChange: user.mustChangePassword },
    ADMIN_MAX_AGE,
  );
  (await cookies()).set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_MAX_AGE,
  });
}

/** スタッフログイン。戻り値はパスワード変更が必要か（初期・仮パスワードのまま） */
export async function loginAdmin(loginId: string, password: string, now = new Date(), ip?: string): Promise<{ mustChange: boolean }> {
  const id = loginId.trim();
  const from = ip ?? (await clientIp());
  await assertNotLocked(id, from, now);
  const user = await prisma.adminUser.findUnique({ where: { loginId: id } });
  if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
    await recordFailure(id, from, now);
    throw new UserError("IDまたはパスワードが違います");
  }
  await prisma.loginFailure.deleteMany({ where: { loginId: id, ip: from } });
  await setAdminCookie(user);
  return { mustChange: user.mustChangePassword };
}

/** パスワード変更後など、この端末のセッションを新しい世代で発行し直す */
export async function reissueAdminSession(adminId: string) {
  const user = await prisma.adminUser.findUnique({ where: { id: adminId } });
  if (user) await setAdminCookie(user);
}

export async function logoutAdmin() {
  (await cookies()).delete(ADMIN_COOKIE);
}

/** ログイン後の戻り先として安全なパスか（同一オリジンの相対パスのみ） */
export function safeNextPath(next: string, fallback = "/admin"): string {
  if (!next.startsWith("/") || next.includes("\\")) return fallback;
  try {
    const u = new URL(next, "http://local.invalid");
    if (u.origin !== "http://local.invalid") return fallback;
    return u.pathname + u.search;
  } catch {
    return fallback;
  }
}

export async function getAdmin(): Promise<AdminSession | null> {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  const session = await verifyAdminSession(token);
  if (!session) return null;
  const user = await prisma.adminUser.findUnique({ where: { id: session.adminId } });
  if (!user || !user.active || user.tokenVersion !== (session.ver ?? 0)) return null;
  return { adminId: user.id, name: user.name, mustChange: user.mustChangePassword };
}

/** スタッフ必須（画面・サーバーアクションの先頭で呼ぶ） */
export async function requireAdmin(opts: { allowMustChange?: boolean } = {}): Promise<AdminSession> {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  // 初期・仮パスワードのままなら、パスワード変更以外の操作はさせない（middleware を通らないサーバーアクションも含めて）
  if (admin.mustChange && !opts.allowMustChange) redirect("/admin/staff?first=1");
  return admin;
}

export function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}
