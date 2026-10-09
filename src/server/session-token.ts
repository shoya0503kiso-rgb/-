// middleware（Edge）からも使うため、Node 専用モジュールに依存しない
import { jwtVerify, SignJWT } from "jose";

export const ADMIN_COOKIE = "admin_session";
export const KIOSK_COOKIE = "kiosk_token";

export interface AdminSession {
  adminId: string;
  name: string;
}

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET を32文字以上で設定してください");
  return new TextEncoder().encode(s);
}

export async function signAdminSession(session: AdminSession, maxAgeSec: number) {
  return new SignJWT({ name: session.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.adminId)
    .setAudience("admin")
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSec}s`)
    .sign(secret());
}

export async function verifyAdminSession(token: string): Promise<AdminSession | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { audience: "admin" });
    if (!payload.sub) return null;
    return { adminId: payload.sub, name: String(payload.name ?? "") };
  } catch {
    return null;
  }
}
