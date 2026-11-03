import "server-only";
import { createHash, randomInt } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { clientIp } from "./auth";
import { prisma } from "./db";
import { UserError } from "./errors";
import { verifyLineIdToken, type LineProfile } from "./line";
import { assertNotLocked, recordFailure } from "./rate-limit";
import { MEMBER_COOKIE, signMemberSession, verifyMemberSession } from "./session-token";
import { getSettings } from "./settings";

const MEMBER_MAX_AGE = 60 * 60 * 24 * 365;
const LINK_CODE_HOURS = 24;
// 読み間違えやすい文字（0/O, 1/I/L）を除く
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const normalizeCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

export function cleanNickname(raw: string) {
  const s = raw.replace(/\s+/g, " ").trim();
  if (!s) throw new UserError("ニックネームを入れてください");
  if ([...s].length > 20) throw new UserError("ニックネームは20文字までです");
  return s;
}

async function setMemberCookie(member: { id: string; tokenVersion: number }) {
  const token = await signMemberSession({ memberId: member.id, ver: member.tokenVersion }, MEMBER_MAX_AGE);
  (await cookies()).set(MEMBER_COOKIE, token, {
    httpOnly: true,
    // LINE アプリ内ブラウザ（LIFF）からも送られるよう lax
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MEMBER_MAX_AGE,
  });
}

export async function getMember() {
  const token = (await cookies()).get(MEMBER_COOKIE)?.value;
  if (!token) return null;
  const session = await verifyMemberSession(token);
  if (!session) return null;
  const member = await prisma.member.findUnique({ where: { id: session.memberId } });
  if (!member || !member.active || member.tokenVersion !== session.ver) return null;
  return member;
}

export type CurrentMember = NonNullable<Awaited<ReturnType<typeof getMember>>>;

/** お客さん必須（画面の先頭で呼ぶ）。未ログインなら登録画面へ */
export async function requireMember(nextPath = "/me") {
  const m = await getMember();
  if (!m) redirect(`/join?next=${encodeURIComponent(nextPath)}`);
  return m;
}

/** サーバーアクション用（リダイレクトせずにエラー） */
export async function requireMemberForAction() {
  const m = await getMember();
  if (!m) throw new UserError("ログインが切れました。画面を開き直してください");
  return m;
}

/** 仮登録（LINE なし・ニックネームだけ） */
export async function signupGuest(nickname: string) {
  const s = await getSettings();
  if (!s.guestSignupEnabled) throw new UserError("LINE からご登録ください");
  const member = await prisma.member.create({ data: { nickname: cleanNickname(nickname) } });
  await setMemberCookie(member);
  return member;
}

/** LINE ログイン。ログイン中の仮登録会員がいれば、その会員に LINE を紐付ける（ポイントを引き継ぐ） */
export async function loginWithLine(idToken: string, verify: (t: string) => Promise<LineProfile> = verifyLineIdToken) {
  const profile = await verify(idToken);
  let member = await prisma.member.findUnique({ where: { lineUserId: profile.userId } });
  if (!member) {
    const current = await getMember();
    if (current && !current.lineUserId) {
      member = await prisma.member.update({ where: { id: current.id }, data: { lineUserId: profile.userId } });
    } else {
      member = await prisma.member.create({
        data: { lineUserId: profile.userId, nickname: (profile.name || "ゲスト").slice(0, 20) },
      });
    }
  }
  if (!member.active) throw new UserError("この会員は利用停止中です。スタッフにお声がけください");
  await setMemberCookie(member);
  return member;
}

/** 引き継ぎコードでログイン（機種変更など） */
export async function loginWithLinkCode(rawCode: string, now = new Date()) {
  const code = normalizeCode(rawCode);
  const ip = await clientIp();
  await assertNotLocked("member-link", ip, now);
  const member = code ? await prisma.member.findUnique({ where: { linkCodeHash: sha256(code) } }) : null;
  if (!member || !member.linkCodeExpiresAt || member.linkCodeExpiresAt < now || !member.active) {
    await recordFailure("member-link", ip, now);
    throw new UserError("引き継ぎコードが違うか、期限切れです");
  }
  const updated = await prisma.member.update({ where: { id: member.id }, data: { linkCodeHash: null, linkCodeExpiresAt: null } });
  await setMemberCookie(updated);
  return updated;
}

/** 引き継ぎコードの発行（スタッフ操作）。平文は画面に一度だけ出す */
export async function issueLinkCode(memberId: string, now = new Date()) {
  const code = Array.from({ length: 8 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");
  await prisma.member.update({
    where: { id: memberId },
    data: { linkCodeHash: sha256(code), linkCodeExpiresAt: new Date(now.getTime() + LINK_CODE_HOURS * 3600_000) },
  });
  return { code: `${code.slice(0, 4)}-${code.slice(4)}`, hours: LINK_CODE_HOURS };
}

export async function logoutMember() {
  (await cookies()).delete(MEMBER_COOKIE);
}
