// スロットと宝くじの当たり判定（乱数は引数で受け取り、テストできるようにする）
import type { Rng } from "./games";

export const SLOT_SYMBOLS = ["trump", "two", "bar", "bell", "grape", "cherry"] as const;
export type SlotSymbol = (typeof SLOT_SYMBOLS)[number];
export type SlotOutcome = SlotSymbol | "miss";

export const SYMBOL_LABEL: Record<SlotSymbol, string> = {
  trump: "トランプちゃん",
  two: "ピンクの2",
  bar: "BAR",
  bell: "ベル",
  grape: "ぶどう",
  cherry: "チェリー",
};

/**
 * 当たりの確率と倍率（払い出し = 1回の値段 × 倍率）。
 * チェリーは左リールにチェリーが止まれば当たり（値段がそのまま戻る）。
 * 払い出しの期待値は約 90%（ポイントが少しずつ減る＝交換の価値を保つ）
 */
export const SLOT_TABLE: { outcome: SlotSymbol; prob: number; mult: number }[] = [
  { outcome: "trump", prob: 0.002, mult: 50 },
  { outcome: "two", prob: 0.006, mult: 20 },
  { outcome: "bar", prob: 0.015, mult: 10 },
  { outcome: "bell", prob: 0.04, mult: 5 },
  { outcome: "grape", prob: 0.07, mult: 3 },
  { outcome: "cherry", prob: 0.12, mult: 1 },
];

export function slotMultiplier(outcome: SlotOutcome) {
  return SLOT_TABLE.find((r) => r.outcome === outcome)?.mult ?? 0;
}

/** 払い出しの期待値（値段1あたり） */
export const SLOT_RETURN_RATE = SLOT_TABLE.reduce((a, r) => a + r.prob * r.mult, 0);

export function pickOutcome(rng: Rng): SlotOutcome {
  let x = rng();
  for (const r of SLOT_TABLE) {
    if (x < r.prob) return r.outcome;
    x -= r.prob;
  }
  return "miss";
}

const pick = <T>(arr: readonly T[], rng: Rng) => arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];

/** 結果に合うように、3つのリールの真ん中に止める絵柄を決める */
export function buildReels(outcome: SlotOutcome, rng: Rng): SlotSymbol[] {
  if (outcome === "cherry") {
    // 左だけチェリー。3つ揃いにはしない
    const others = SLOT_SYMBOLS.filter((s) => s !== "cherry");
    const b = pick(others, rng);
    let c = pick(others, rng);
    if (b === c) c = others[(others.indexOf(c) + 1) % others.length];
    return ["cherry", b, c];
  }
  if (outcome !== "miss") return [outcome, outcome, outcome];
  // 外れ：左はチェリー以外、3つ揃いにしない。ときどき「リーチ」（左と真ん中が同じ）で惜しくする
  const noCherry = SLOT_SYMBOLS.filter((s) => s !== "cherry");
  const a = pick(noCherry, rng);
  const b = rng() < 0.25 ? a : pick(SLOT_SYMBOLS, rng);
  let c = pick(SLOT_SYMBOLS, rng);
  if (a === b && c === a) c = SLOT_SYMBOLS[(SLOT_SYMBOLS.indexOf(c) + 1) % SLOT_SYMBOLS.length];
  return [a, b, c];
}

/** 左と真ん中が同じ絵柄（リーチ演出を出す） */
export const isReach = (reels: string[]) => reels[0] === reels[1];

// ───── 宝くじ ─────

/** 当選の等（1〜4）。外れは 0。下の桁から何桁そろっているかで決める */
export function lotteryRank(ticket: string, winning: string) {
  let same = 0;
  for (let i = 1; i <= 4; i++) {
    if (ticket[ticket.length - i] === winning[winning.length - i]) same = i;
    else break;
  }
  return same === 0 ? 0 : 5 - same; // 4桁=1等 … 1桁=4等
}

export function randomTicketNumber(rng: Rng) {
  return String(Math.min(9999, Math.floor(rng() * 10000))).padStart(4, "0");
}
