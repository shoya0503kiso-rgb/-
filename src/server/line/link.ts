// LINEアカウントと従業員の紐付け（P-17）
import { randomInt } from "node:crypto";
import { prisma } from "../db";
import { UserError } from "../errors";

const CODE_TTL_MS = 24 * 60 * 60 * 1000;

/** 6桁の連携コードを発行（同じ従業員の未使用コードは無効化） */
export async function issueLinkCode(employeeId: string, now = new Date()) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee || !employee.active) throw new UserError("在籍中の従業員にのみ発行できます");
  await prisma.lineLinkCode.deleteMany({ where: { employeeId, usedAt: null } });
  for (let i = 0; i < 10; i++) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const exists = await prisma.lineLinkCode.findUnique({ where: { code } });
    if (exists && exists.expiresAt > now && !exists.usedAt) continue;
    if (exists) await prisma.lineLinkCode.delete({ where: { code } });
    return prisma.lineLinkCode.create({ data: { employeeId, code, expiresAt: new Date(now.getTime() + CODE_TTL_MS) } });
  }
  throw new UserError("コードの発行に失敗しました。もう一度お試しください。");
}

/** LINEから送られたコードで紐付け。成功したら従業員を返す */
export async function linkByCode(code: string, lineUserId: string, displayName: string, now = new Date()) {
  const row = await prisma.lineLinkCode.findUnique({ where: { code }, include: { employee: true } });
  if (!row || row.usedAt || row.expiresAt <= now || !row.employee.active) return null;
  await prisma.$transaction([
    // このLINEアカウントが別の従業員に紐付いていれば外す
    prisma.lineAccount.deleteMany({ where: { OR: [{ lineUserId }, { employeeId: row.employeeId }] } }),
    prisma.lineAccount.create({ data: { employeeId: row.employeeId, lineUserId, displayName } }),
    prisma.lineLinkCode.update({ where: { code }, data: { usedAt: now } }),
  ]);
  return row.employee;
}

export async function unlinkLine(employeeId: string) {
  await prisma.lineAccount.deleteMany({ where: { employeeId } });
}

export async function employeeByLineUser(lineUserId: string) {
  const acc = await prisma.lineAccount.findUnique({ where: { lineUserId }, include: { employee: true } });
  return acc && acc.employee.active ? acc.employee : null;
}
