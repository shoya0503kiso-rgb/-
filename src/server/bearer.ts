import { timingSafeEqual } from "node:crypto";

/** Authorization: Bearer <CRON_SECRET> か（定期実行・外部連携用。未設定なら常に拒否） */
export function hasCronSecret(authorization: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const a = Buffer.from(authorization ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
