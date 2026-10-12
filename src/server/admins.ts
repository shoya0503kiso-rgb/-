// 管理者アカウントの管理（P-16：権限は「管理者」1種類）
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { UserError } from "./errors";

const MIN_PASSWORD = 8;

function checkPassword(pw: string) {
  if (pw.length < MIN_PASSWORD) throw new UserError(`パスワードは${MIN_PASSWORD}文字以上にしてください`);
  if (/^(.)\1+$/.test(pw) || ["password", "admin1234", "12345678"].includes(pw.toLowerCase())) {
    throw new UserError("推測されやすいパスワードは使えません");
  }
}

export function listAdmins() {
  return prisma.adminUser.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, loginId: true, name: true, active: true, createdAt: true, mustChangePassword: true },
  });
}

export async function createAdmin(input: { loginId: string; name: string; password: string }) {
  const loginId = input.loginId.trim();
  const name = input.name.trim();
  if (!/^[A-Za-z0-9_.-]{3,32}$/.test(loginId)) throw new UserError("ログインIDは半角英数字3〜32文字で入力してください");
  if (!name) throw new UserError("名前を入力してください");
  checkPassword(input.password);
  if (await prisma.adminUser.findUnique({ where: { loginId } })) throw new UserError("このログインIDは使われています");
  // 作成者が決めた仮パスワードなので、本人が初回に変更するよう促す
  return prisma.adminUser.create({
    data: { loginId, name, passwordHash: await bcrypt.hash(input.password, 10), mustChangePassword: true },
  });
}

/** 自分のパスワード変更。他の端末のセッションは無効にする（tokenVersion +1） */
export async function changePassword(adminId: string, current: string, next: string) {
  const user = await prisma.adminUser.findUnique({ where: { id: adminId } });
  if (!user || !(await bcrypt.compare(current, user.passwordHash))) throw new UserError("現在のパスワードが違います");
  if (current === next) throw new UserError("新しいパスワードが現在と同じです");
  checkPassword(next);
  return prisma.adminUser.update({
    where: { id: adminId },
    data: { passwordHash: await bcrypt.hash(next, 10), mustChangePassword: false, tokenVersion: { increment: 1 } },
  });
}

/** 他の管理者の停止・再開。自分自身や最後の1人は停止できない */
export async function setAdminActive(actorId: string, targetId: string, active: boolean) {
  if (actorId === targetId) throw new UserError("自分自身は停止できません");
  if (!active) {
    const others = await prisma.adminUser.count({ where: { active: true, id: { not: targetId } } });
    if (others === 0) throw new UserError("管理者が1人もいなくなるため停止できません");
  }
  await prisma.adminUser.update({ where: { id: targetId }, data: { active, tokenVersion: { increment: 1 } } });
}

export async function mustChangePassword(adminId: string) {
  return (await prisma.adminUser.findUnique({ where: { id: adminId } }))?.mustChangePassword ?? false;
}

/** 他の管理者がパスワードを忘れたとき：仮パスワードを再発行（本人は次回ログイン時に変更） */
export async function resetAdminPassword(actorId: string, targetId: string, temp: string) {
  if (actorId === targetId) throw new UserError("自分のパスワードは「パスワードを変更」から変えてください");
  checkPassword(temp);
  await prisma.adminUser.update({
    where: { id: targetId },
    data: { passwordHash: await bcrypt.hash(temp, 10), mustChangePassword: true, tokenVersion: { increment: 1 } },
  });
}
