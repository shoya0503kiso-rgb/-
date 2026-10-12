// 総当たり対策（管理者ログイン・LINE連携コード）
import { prisma } from "./db";
import { UserError } from "./errors";

const LOCK_FAILURES = 5;
const LOCK_WINDOW_MS = 15 * 60 * 1000;

/**
 * 失敗回数の制限。ID＋接続元IPの組み合わせで数えるので、他人がわざと失敗しても
 * 別の場所からの店長のログインは締め出されない。同じIPからの大量の失敗も止める
 */
export async function assertNotLocked(key: string, ip: string, now: Date) {
  const since = new Date(now.getTime() - LOCK_WINDOW_MS);
  const [byKey, byIp, byKeyHour] = await Promise.all([
    prisma.loginFailure.count({ where: { loginId: key, ip, createdAt: { gte: since } } }),
    ip ? prisma.loginFailure.count({ where: { ip, createdAt: { gte: since } } }) : Promise.resolve(0),
    // 接続元を変えながらの試行にも上限（IDだけで1時間30回）
    prisma.loginFailure.count({ where: { loginId: key, createdAt: { gte: new Date(now.getTime() - 3600_000) } } }),
  ]);
  if (byKey >= LOCK_FAILURES || byIp >= LOCK_FAILURES * 4 || byKeyHour >= 30) {
    throw new UserError("続けて失敗したため、15分間お待ちください");
  }
}

export async function recordFailure(key: string, ip: string, now: Date) {
  await prisma.loginFailure.create({ data: { loginId: key, ip, createdAt: now } });
  await prisma.loginFailure.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 24 * 3600_000) } } });
}
