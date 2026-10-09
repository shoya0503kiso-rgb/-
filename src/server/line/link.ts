// LINEアカウントと従業員の紐付け（P-17）
import { randomInt } from "node:crypto";
import { prisma } from "../db";
import { UserError } from "../errors";
import { assertNotLocked, recordFailure } from "../rate-limit";
import { push, text } from "./client";

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

export type LinkResult = { ok: true; employee: { id: string; name: string } } | { ok: false; reason: "invalid" | "locked" };

/**
 * LINEから送られたコードで紐付け。
 * 総当たり対策として LINE ユーザーごとに失敗回数を制限し、コードは1回しか使えない
 */
export async function linkByCode(code: string, lineUserId: string, displayName: string, now = new Date()): Promise<LinkResult> {
  const key = `line:${lineUserId}`;
  try {
    await assertNotLocked(key, "", now);
  } catch {
    return { ok: false, reason: "locked" };
  }
  const row = await prisma.lineLinkCode.findUnique({ where: { code }, include: { employee: { include: { lineAccount: true } } } });
  if (!row || row.usedAt || row.expiresAt <= now || !row.employee.active) {
    await recordFailure(key, "", now);
    return { ok: false, reason: "invalid" };
  }
  const previousLine = row.employee.lineAccount?.lineUserId;
  const linked = await prisma.$transaction(async (tx) => {
    // 同じコードの同時使用は先着1人だけ
    const claimed = await tx.lineLinkCode.updateMany({ where: { code, usedAt: null }, data: { usedAt: now } });
    if (claimed.count !== 1) return false;
    // このLINEアカウントが別の従業員に紐付いていれば外す
    await tx.lineAccount.deleteMany({ where: { OR: [{ lineUserId }, { employeeId: row.employeeId }] } });
    await tx.lineAccount.create({ data: { employeeId: row.employeeId, lineUserId, displayName } });
    // 連携先が変わったら、発行済みの本人専用リンクを無効にする
    await tx.employee.update({ where: { id: row.employeeId }, data: { linkVersion: { increment: 1 } } });
    return true;
  });
  if (!linked) return { ok: false, reason: "invalid" };
  // 別のLINEから付け替えられた場合は、元のLINEに知らせる（乗っ取りに気づけるように）
  if (previousLine && previousLine !== lineUserId) {
    await push(previousLine, [text(`${row.employee.name}さんのLINE連携が別のLINEアカウントに変更されました。心当たりがない場合は店長に連絡してください。`)]).catch(() => undefined);
  }
  return { ok: true, employee: { id: row.employee.id, name: row.employee.name } };
}

export async function unlinkLine(employeeId: string) {
  await prisma.$transaction([
    prisma.lineAccount.deleteMany({ where: { employeeId } }),
    prisma.employee.update({ where: { id: employeeId }, data: { linkVersion: { increment: 1 } } }),
  ]);
}

export async function employeeByLineUser(lineUserId: string) {
  const acc = await prisma.lineAccount.findUnique({ where: { lineUserId }, include: { employee: true } });
  return acc && acc.employee.active ? acc.employee : null;
}
