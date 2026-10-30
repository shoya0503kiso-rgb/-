import "server-only";
import type { Tx } from "./db";
import { UserError } from "./errors";

export type PointKind = "checkin" | "stamp_card" | "game" | "mochi" | "darts" | "poker" | "manual" | "redeem" | "refund";

export const KIND_LABEL: Record<string, string> = {
  checkin: "来店",
  stamp_card: "スタンプカード達成",
  game: "デイリーゲーム",
  mochi: "もちもち当選",
  darts: "ダーツ",
  poker: "ポーカー",
  manual: "スタッフ調整",
  redeem: "ポイント交換",
  refund: "交換の取消",
};

/**
 * ポイントを増減し、履歴を残す（必ずトランザクション内で呼ぶ）。
 * 減らすときは残高が足りなければ UserError（残高はマイナスにしない）
 */
export async function changePoints(
  tx: Tx,
  p: { memberId: string; amount: number; kind: PointKind; note?: string; businessDate: string; adminId?: string },
) {
  if (!Number.isInteger(p.amount) || p.amount === 0) return;
  if (p.amount < 0) {
    const r = await tx.member.updateMany({ where: { id: p.memberId, points: { gte: -p.amount } }, data: { points: { increment: p.amount } } });
    if (r.count === 0) throw new UserError("ポイントが足りません");
  } else {
    await tx.member.update({ where: { id: p.memberId }, data: { points: { increment: p.amount } } });
  }
  await tx.pointTransaction.create({
    data: { memberId: p.memberId, amount: p.amount, kind: p.kind, note: p.note ?? "", businessDate: p.businessDate, adminId: p.adminId },
  });
}

/** ポイント倍率デーを反映した付与ポイント（来店・ゲーム用） */
export function applyPointDay(base: number, day: { mode: string; value: number } | null, target: "checkin" | "game") {
  if (!day) return base;
  if (day.mode === "fixed") return target === "checkin" ? Math.max(0, Math.round(day.value)) : base;
  return Math.max(0, Math.floor(base * day.value));
}

export function pointDayLabel(day: { mode: string; value: number; label: string }) {
  if (day.label) return day.label;
  return day.mode === "fixed" ? `来店${day.value}ptデー` : `ポイント${day.value}倍デー`;
}
