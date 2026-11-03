// middleware（Edge）からも使うため、Node 専用モジュールに依存しない
import { jwtVerify, SignJWT } from "jose";

export const ADMIN_COOKIE = "mm_admin";
export const MEMBER_COOKIE = "mm_member";

export interface AdminSession {
  adminId: string;
  name: string;
  /** AdminUser.tokenVersion と一致する間だけ有効 */
  ver?: number;
  /** 初期・仮パスワードのまま（パスワード変更画面以外に入れない） */
  mustChange?: boolean;
}

export interface MemberSession {
  memberId: string;
  /** Member.tokenVersion と一致する間だけ有効 */
  ver: number;
}

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET を32文字以上で設定してください");
  if (process.env.NODE_ENV === "production" && s.startsWith("change-me")) {
    throw new Error("SESSION_SECRET が .env.example の値のままです。ランダムな文字列に変更してください");
  }
  return new TextEncoder().encode(s);
}

export async function signAdminSession(session: AdminSession, maxAgeSec: number) {
  return new SignJWT({ name: session.name, ver: session.ver ?? 0, mc: !!session.mustChange })
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
    return { adminId: payload.sub, name: String(payload.name ?? ""), ver: Number(payload.ver ?? 0), mustChange: payload.mc === true };
  } catch {
    return null;
  }
}

export async function signMemberSession(session: MemberSession, maxAgeSec: number) {
  return new SignJWT({ ver: session.ver })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.memberId)
    .setAudience("member")
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSec}s`)
    .sign(secret());
}

export async function verifyMemberSession(token: string): Promise<MemberSession | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { audience: "member" });
    if (!payload.sub) return null;
    return { memberId: payload.sub, ver: Number(payload.ver ?? 0) };
  } catch {
    return null;
  }
}
