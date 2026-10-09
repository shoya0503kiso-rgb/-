import "server-only";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { UserError } from "./errors";
import { ADMIN_COOKIE, KIOSK_COOKIE, signAdminSession, verifyAdminSession, type AdminSession } from "./session-token";

const ADMIN_MAX_AGE = 60 * 60 * 24 * 14;
const KIOSK_MAX_AGE = 60 * 60 * 24 * 365 * 5;

export async function loginAdmin(loginId: string, password: string): Promise<void> {
  const user = await prisma.adminUser.findUnique({ where: { loginId: loginId.trim() } });
  if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new UserError("IDまたはパスワードが違います");
  }
  const token = await signAdminSession({ adminId: user.id, name: user.name }, ADMIN_MAX_AGE);
  (await cookies()).set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_MAX_AGE,
  });
}

export async function logoutAdmin() {
  (await cookies()).delete(ADMIN_COOKIE);
}

export async function getAdmin(): Promise<AdminSession | null> {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  const session = await verifyAdminSession(token);
  if (!session) return null;
  const user = await prisma.adminUser.findUnique({ where: { id: session.adminId } });
  return user && user.active ? { adminId: user.id, name: user.name } : null;
}

/** 管理者必須（画面・サーバーアクションの先頭で呼ぶ） */
export async function requireAdmin(): Promise<AdminSession> {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  return admin;
}

export function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

// ───── 打刻端末 ─────

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function registerKioskDevice(name: string) {
  const token = randomBytes(32).toString("hex");
  const device = await prisma.kioskDevice.create({ data: { name: name.trim() || "店舗iPad", tokenHash: sha256(token) } });
  (await cookies()).set(KIOSK_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: KIOSK_MAX_AGE,
  });
  return device;
}

export async function getKioskDevice() {
  const token = (await cookies()).get(KIOSK_COOKIE)?.value;
  if (!token) return null;
  const device = await prisma.kioskDevice.findUnique({ where: { tokenHash: sha256(token) } });
  if (!device || device.revokedAt) return null;
  return device;
}

export async function requireKioskDevice() {
  const device = await getKioskDevice();
  if (!device) throw new UserError("この端末は打刻端末として登録されていません。管理者に連絡してください。");
  return device;
}
