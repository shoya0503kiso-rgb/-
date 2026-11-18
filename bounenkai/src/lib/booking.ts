// 料金・予約枠の計算（画面とサーバーの両方で使う。仕様書 2・3章）

export type Plan = "basic" | "casino";
export type GroupType = "company" | "friends";

export const MIN_PEOPLE = 8;
export const MAX_PEOPLE = 30;
export const COURSE_MIN = 120; // 2時間飲み放題
export const GAP_MIN = 30; // 前後の組とのあいだ
export const FIRST_START_MIN = 17 * 60;
export const LAST_START_MIN = 22 * 60;
export const CLOSE_MIN = 24 * 60; // 0:00閉店
export const MAX_GROUPS_PER_DAY = 2;
export const DEADLINE_DAYS = 2; // 利用日の2日前まで
export const OPEN_MONTHS = [11, 12];
export const HORS_PRICE = 1000;

export const PLANS: Record<Plan, { name: string; short: string; desc: string; games: string[] }> = {
  basic: { name: "基本プラン", short: "基本", desc: "ポーカー＋2時間飲み放題", games: ["ポーカー"] },
  casino: { name: "カジノプラン", short: "カジノ", desc: "ポーカー＋ブラックジャック・バカラ＋2時間飲み放題", games: ["ポーカー", "ブラックジャック", "バカラ"] },
};

/** 人数の段階（下限・上限・1人あたり料金） */
export const TIERS: { min: number; max: number; price: Record<Plan, number> }[] = [
  { min: 8, max: 14, price: { basic: 4000, casino: 5500 } },
  { min: 15, max: 19, price: { basic: 3800, casino: 5300 } },
  { min: 20, max: 30, price: { basic: 3500, casino: 5000 } },
];
/** 延長1時間あたり・1人あたり（人数割引なし） */
export const EXTENSION_PRICE: Record<Plan, number> = { basic: 2500, casino: 3000 };

export const GROUP_TYPES: Record<GroupType, string> = { company: "会社・団体", friends: "友人・個人グループ" };

export function isPlan(v: unknown): v is Plan {
  return v === "basic" || v === "casino";
}
export function isGroupType(v: unknown): v is GroupType {
  return v === "company" || v === "friends";
}

export function tierFor(people: number) {
  return TIERS.find((t) => people >= t.min && people <= t.max) ?? null;
}

export function coursePrice(plan: Plan, people: number): number | null {
  const t = tierFor(people);
  return t ? t.price[plan] : null;
}

export interface Quote {
  people: number;
  coursePerPerson: number;
  extensionPerPerson: number;
  horsPerPerson: number;
  perPerson: number;
  course: number;
  extension: number;
  hors: number;
  total: number;
}

/** 合計金額の目安。人数が範囲外なら null */
export function quote(input: { plan: Plan; people: number; extensionHours: number; hors: boolean }): Quote | null {
  const { plan, people, extensionHours, hors } = input;
  if (!Number.isInteger(people) || !Number.isInteger(extensionHours) || extensionHours < 0) return null;
  const c = coursePrice(plan, people);
  if (c === null) return null;
  const e = EXTENSION_PRICE[plan] * extensionHours;
  const h = hors ? HORS_PRICE : 0;
  return {
    people,
    coursePerPerson: c,
    extensionPerPerson: e,
    horsPerPerson: h,
    perPerson: c + e + h,
    course: c * people,
    extension: e * people,
    hors: h * people,
    total: (c + e + h) * people,
  };
}

// ───────── 時間・枠 ─────────

export function fmtMin(min: number) {
  const h = Math.floor(min / 60) % 24;
  return `${h}:${String(min % 60).padStart(2, "0")}`;
}

export function endMin(startMin: number, extensionHours: number) {
  return startMin + COURSE_MIN + extensionHours * 60;
}

/** スタート時間の候補（17:00〜22:00） */
export function startCandidates(step: number): number[] {
  const out: number[] = [];
  for (let m = FIRST_START_MIN; m <= LAST_START_MIN; m += step) out.push(m);
  return out;
}

export interface Booked {
  startMin: number;
  extensionHours: number;
}

/**
 * そのスタート時間で選べる延長の上限（時間）。スタートできないなら -1。
 * 閉店（0:00）と、前後の予約との30分のあいだから決める。1日2組まで
 */
export function maxExtension(startMin: number, booked: Booked[], ignoreIndex = -1): number {
  const others = booked.filter((_, i) => i !== ignoreIndex);
  if (others.length >= MAX_GROUPS_PER_DAY) return -1;
  if (startMin < FIRST_START_MIN || startMin > LAST_START_MIN) return -1;
  let limitEnd = CLOSE_MIN;
  for (const b of others) {
    const bEnd = endMin(b.startMin, b.extensionHours);
    if (b.startMin >= startMin) {
      // 後ろの組：その組のスタートの30分前までに終わる
      limitEnd = Math.min(limitEnd, b.startMin - GAP_MIN);
    } else if (bEnd + GAP_MIN > startMin) {
      // 前の組の終わり＋30分より前には始められない
      return -1;
    }
  }
  const room = limitEnd - (startMin + COURSE_MIN);
  if (room < 0) return -1;
  return Math.floor(room / 60);
}

export interface SlotInfo {
  startMin: number;
  label: string;
  available: boolean;
  maxExtension: number;
}

export function daySlots(booked: Booked[], step: number): SlotInfo[] {
  return startCandidates(step).map((s) => {
    const max = maxExtension(s, booked);
    return { startMin: s, label: fmtMin(s), available: max >= 0, maxExtension: Math.max(max, 0) };
  });
}

// ───────── 日付（JST） ─────────

export function jstToday(now = new Date()): string {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

export function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isValidYmd(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** 受付期間：その年（JST）の11月・12月。今日が1〜10月でも今年の11・12月 */
export function seasonYear(now = new Date()) {
  return Number(jstToday(now).slice(0, 4));
}

/** 予約できる日か（今年の11・12月で、2日後以降） */
export function isBookableDate(ymd: string, now = new Date()): boolean {
  if (!isValidYmd(ymd)) return false;
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(5, 7));
  if (y !== seasonYear(now) || !OPEN_MONTHS.includes(m)) return false;
  return ymd >= addDays(jstToday(now), DEADLINE_DAYS);
}

/** 受付期間の月の一覧 [{year, month}] */
export function seasonMonths(now = new Date()) {
  const y = seasonYear(now);
  return OPEN_MONTHS.map((month) => ({ year: y, month }));
}

const WD = ["日", "月", "火", "水", "木", "金", "土"];
export function fmtDate(ymd: string) {
  const d = new Date(`${ymd}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日(${WD[d.getUTCDay()]})`;
}

export function yen(n: number) {
  return `${n.toLocaleString("ja-JP")}円`;
}

export function extensionLabel(h: number) {
  return h === 0 ? "なし" : `${h}時間`;
}
