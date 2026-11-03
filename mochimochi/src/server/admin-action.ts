import "server-only";
import { requireAdmin } from "./auth";
import { runAction } from "./errors";
import type { AdminSession } from "./session-token";

/** 管理画面のサーバーアクション：スタッフ確認 → 実行 → エラーはメッセージで返す */
export async function adminAction<T>(fn: (admin: AdminSession) => Promise<T>, message?: string) {
  const admin = await requireAdmin();
  return runAction(() => fn(admin), message);
}
