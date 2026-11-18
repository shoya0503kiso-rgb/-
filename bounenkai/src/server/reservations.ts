import "server-only";
import { randomInt } from "node:crypto";
import { z } from "zod";
import {
  daySlots,
  endMin,
  extensionLabel,
  fmtDate,
  fmtMin,
  GROUP_TYPES,
  isBookableDate,
  maxExtension,
  MAX_GROUPS_PER_DAY,
  MAX_PEOPLE,
  MIN_PEOPLE,
  PLANS,
  quote,
  seasonMonths,
  startCandidates,
  yen,
  type Booked,
  type GroupType,
  type Plan,
} from "@/lib/booking";
import { formatPhone, isValidEmail, isValidPhone } from "@/lib/validate";
import { START_STEP_MIN, STORE, TAX_INCLUDED } from "@/lib/config";
import { cancelPolicyText, PRICE_NOTE } from "@/lib/policy";
import { prisma, type Tx } from "./db";
import { UserError } from "./errors";
import { sendLinePush, sendMail } from "./notify";

async function bookedOn(db: Tx, date: string, excludeId?: string): Promise<Booked[]> {
  const rows = await db.reservation.findMany({
    where: { date, status: "active", ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { startMin: true, extensionHours: true },
    orderBy: { startMin: "asc" },
  });
  return rows;
}

/** 1日分の空き（スタート時間ごと） */
export async function dayAvailability(date: string, now = new Date()) {
  if (!isBookableDate(date, now)) return { date, bookable: false, slots: [] };
  const booked = await bookedOn(prisma, date);
  return { date, bookable: true, slots: daySlots(booked, START_STEP_MIN) };
}

/** 受付期間の各日の状態（◯：空きあり、△：あと1組、×：満席・受付終了） */
export async function seasonAvailability(now = new Date()) {
  const months = seasonMonths(now);
  const y = months[0].year;
  const from = `${y}-${String(months[0].month).padStart(2, "0")}-01`;
  const to = `${y}-${String(months.at(-1)!.month).padStart(2, "0")}-31`;
  const rows = await prisma.reservation.findMany({
    where: { status: "active", date: { gte: from, lte: to } },
    select: { date: true, startMin: true, extensionHours: true },
  });
  const byDate = new Map<string, Booked[]>();
  for (const r of rows) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]);
  const days: Record<string, "open" | "few" | "full" | "closed"> = {};
  for (const { year, month } of months) {
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    for (let d = 1; d <= last; d++) {
      const ymd = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (!isBookableDate(ymd, now)) {
        days[ymd] = "closed";
        continue;
      }
      const b = byDate.get(ymd) ?? [];
      const anyOpen = startCandidates(START_STEP_MIN).some((s) => maxExtension(s, b) >= 0);
      days[ymd] = !anyOpen ? "full" : b.length === MAX_GROUPS_PER_DAY - 1 ? "few" : "open";
    }
  }
  return { months, days };
}

export const reservationInput = z.object({
  groupType: z.enum(["company", "friends"]),
  representative: z.string().trim().min(1, "代表者名を入力してください").max(50),
  companyName: z.string().trim().max(80).default(""),
  people: z.coerce.number().int().min(MIN_PEOPLE, `人数は${MIN_PEOPLE}〜${MAX_PEOPLE}名です`).max(MAX_PEOPLE, `人数は${MIN_PEOPLE}〜${MAX_PEOPLE}名です`),
  phone: z
    .string()
    .refine(isValidPhone, "電話番号を正しく入力してください")
    .transform(formatPhone),
  email: z.string().trim().refine(isValidEmail, "メールアドレスを正しく入力してください"),
  date: z.string(),
  startMin: z.coerce.number().int(),
  plan: z.enum(["basic", "casino"]),
  extensionHours: z.coerce.number().int().min(0),
  hors: z.boolean(),
});
export type ReservationInput = z.input<typeof reservationInput>;

function newCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[randomInt(chars.length)]).join("");
}

export function summaryLines(r: {
  code: string;
  date: string;
  startMin: number;
  extensionHours: number;
  plan: string;
  people: number;
  hors: boolean;
  estimate: number;
  representative: string;
  companyName: string;
  phone: string;
  groupType: string;
}) {
  const plan = PLANS[r.plan as Plan];
  return [
    `受付番号：${r.code}`,
    `利用日：${fmtDate(r.date)}`,
    `時間：${fmtMin(r.startMin)}〜${fmtMin(endMin(r.startMin, r.extensionHours))}`,
    `プラン：${plan?.name ?? r.plan}`,
    `人数：${r.people}名`,
    `延長：${extensionLabel(r.extensionHours)}`,
    `オードブル：${r.hors ? "あり" : "なし"}`,
    `合計金額の目安：${yen(r.estimate)}${TAX_INCLUDED === null ? "" : TAX_INCLUDED ? "（税込）" : "（税別）"}`,
    `代表者名：${r.representative}`,
    `会社名・団体名：${r.groupType === "company" ? r.companyName : `なし（${GROUP_TYPES[r.groupType as GroupType] ?? ""}）`}`,
    `電話番号：${r.phone}`,
  ];
}

/** 予約を作る。同じ日の枠の判定は日ごとのロック行で直列にする */
export async function createReservation(raw: unknown, now = new Date(), ip = "") {
  const parsed = reservationInput.safeParse(raw);
  if (!parsed.success) throw new UserError(parsed.error.issues[0]?.message ?? "入力内容を確認してください");
  const v = parsed.data;
  if (v.groupType === "company" && !v.companyName) throw new UserError("会社名・団体名を入力してください");
  const companyName = v.groupType === "company" ? v.companyName : "";
  if (!isBookableDate(v.date, now)) throw new UserError("この日はご予約を受け付けていません（11月・12月の、利用日の2日前まで）");
  if (!startCandidates(START_STEP_MIN).includes(v.startMin)) throw new UserError("スタート時間を選び直してください");
  const q = quote({ plan: v.plan, people: v.people, extensionHours: v.extensionHours, hors: v.hors });
  if (!q) throw new UserError("入力内容を確認してください");

  if (ip) {
    // いたずら対策：同じ接続元から1時間に5件まで
    const recent = await prisma.reservation.count({ where: { ip, createdAt: { gte: new Date(now.getTime() - 3600_000) } } });
    if (recent >= 5) throw new UserError("短時間に多くのお申し込みがありました。お手数ですがお店にお電話ください");
  }

  const created = await prisma.$transaction(async (tx) => {
    // 同じ日の予約を直列にする（PostgreSQL では行ロック、SQLite は書き込みロック）
    await tx.dayLock.upsert({ where: { date: v.date }, create: { date: v.date, version: 1 }, update: { version: { increment: 1 } } });
    const booked = await bookedOn(tx, v.date);
    const max = maxExtension(v.startMin, booked);
    if (max < 0) throw new UserError("申し訳ありません。この時間はちょうど埋まってしまいました。別の時間をお選びください");
    if (v.extensionHours > max) throw new UserError(`この時間からの延長は最大${max}時間です。延長を選び直してください`);
    for (let i = 0; i < 5; i++) {
      const code = newCode();
      if (await tx.reservation.findUnique({ where: { code } })) continue;
      return tx.reservation.create({
        data: {
          code,
          groupType: v.groupType,
          representative: v.representative,
          companyName,
          phone: v.phone,
          email: v.email,
          date: v.date,
          startMin: v.startMin,
          plan: v.plan,
          bookedPeople: v.people,
          people: v.people,
          extensionHours: v.extensionHours,
          hors: v.hors,
          estimate: q.total,
          ip,
        },
      });
    }
    throw new Error("受付番号を作れませんでした");
  });

  const lines = summaryLines(created);
  const base = process.env.APP_BASE_URL?.replace(/\/$/, "") ?? "";
  const [, mailStatus] = await Promise.all([
    sendLinePush(["🎰 忘年会の予約が入りました", "", ...lines, "", base ? `${base}/admin` : ""].join("\n").trim(), created.id),
    sendMail(
      created.email,
      `【${STORE.name}】忘年会のご予約ありがとうございます（受付番号 ${created.code}）`,
      [
        `${created.representative} 様`,
        "",
        `このたびは ${STORE.name} のカジノ体験型 貸し切り忘年会をご予約いただき、ありがとうございます。`,
        "以下の内容で承りました。",
        "",
        ...lines.filter((l) => !l.startsWith("電話番号")),
        "",
        `※ ${PRICE_NOTE}`,
        "※ お支払いは当日、現金でお願いします。",
        "※ 当日の延長は、後ろにご予約が入っていない場合のみ承ります。",
        "※ チップの換金・景品との交換はできません。",
        "",
        cancelPolicyText(),
        "",
        "ご予約の変更・キャンセルはお店までご連絡ください。",
        `${STORE.name}${STORE.phone ? `　TEL ${STORE.phone}` : ""}`,
        STORE.company,
      ].join("\n"),
      created.id,
    ),
  ]);
  return { ...created, mailStatus };
}

// ───────── 管理画面 ─────────

export function listReservations(opts: { from?: string; includeCancelled?: boolean }) {
  return prisma.reservation.findMany({
    where: { ...(opts.from ? { date: { gte: opts.from } } : {}), ...(opts.includeCancelled ? {} : { status: "active" }) },
    orderBy: [{ date: "asc" }, { startMin: "asc" }],
  });
}

export async function setConfirmed(id: string, confirmed: boolean) {
  await prisma.reservation.update({ where: { id }, data: { confirmed } });
}

export async function cancelReservation(id: string, now = new Date()) {
  const r = await prisma.reservation.findUnique({ where: { id } });
  if (!r) throw new UserError("予約が見つかりません");
  if (r.status === "cancelled") throw new UserError("すでにキャンセル済みです");
  await prisma.reservation.update({ where: { id }, data: { status: "cancelled", cancelledAt: now } });
}

/** 人数変更。料金は新しい人数の段階で計算し直す */
export async function changePeople(id: string, people: number) {
  if (!Number.isInteger(people) || people < MIN_PEOPLE || people > MAX_PEOPLE) throw new UserError(`人数は${MIN_PEOPLE}〜${MAX_PEOPLE}名です`);
  const r = await prisma.reservation.findUnique({ where: { id } });
  if (!r) throw new UserError("予約が見つかりません");
  if (r.status !== "active") throw new UserError("キャンセル済みの予約は変更できません");
  const q = quote({ plan: r.plan as Plan, people, extensionHours: r.extensionHours, hors: r.hors });
  if (!q) throw new UserError("料金を計算できませんでした");
  await prisma.reservation.update({ where: { id }, data: { people, estimate: q.total } });
}

export async function setNote(id: string, note: string) {
  await prisma.reservation.update({ where: { id }, data: { note: note.slice(0, 500) } });
}

export function recentNotifications(limit = 50) {
  return prisma.notificationLog.findMany({ orderBy: { createdAt: "desc" }, take: limit });
}
