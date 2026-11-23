// スロットと宝くじの当たり判定（乱数は引数で受け取り、テストできるようにする）
import type { Rng } from "./games";

export const SLOT_SYMBOLS = ["trump", "two", "bar", "bell", "grape", "cherry"] as const;
export type SlotSymbol = (typeof SLOT_SYMBOLS)[number];
/** chance = もちもちランプが光る（目押しチャンス）。trump = とらんぷちゃん揃い（もう一回） */
export type SlotOutcome = "chance" | "trump" | "cherry" | "grape" | "bell" | "bar" | "miss";

export const SYMBOL_LABEL: Record<SlotSymbol, string> = {
  trump: "とらんぷちゃん",
  two: "ピンクの2",
  bar: "BAR",
  bell: "ベル",
  grape: "ぶどう",
  cherry: "チェリー",
};

/** 当たりの確率（残りは外れ）。配当のポイントは管理画面の設定 */
export const SLOT_PROBS: { outcome: Exclude<SlotOutcome, "miss">; prob: number }[] = [
  { outcome: "chance", prob: 1 / 120 },
  { outcome: "trump", prob: 0.14 },
  { outcome: "cherry", prob: 0.06 },
  { outcome: "grape", prob: 0.1 },
  { outcome: "bell", prob: 0.12 },
  { outcome: "bar", prob: 0.15 },
];

export type SlotPays = { bar: number; bell: number; grape: number; cherry: number; chance: number; skill: number; cost: number };

/** その結果ですぐ入るポイント（チャンスはランプが光った時点のボーナス。目押しの分は別） */
export function slotPayout(outcome: SlotOutcome, p: SlotPays) {
  if (outcome === "chance") return p.chance;
  if (outcome === "bar" || outcome === "bell" || outcome === "grape" || outcome === "cherry") return p[outcome];
  return 0;
}

/**
 * 1回の値段に対する払い出しの期待値。skillRate は目押しの成功率（0〜1）。
 * とらんぷちゃん揃いは次の1回が無料なので、値段1回分として数える
 */
export function slotReturnRate(p: SlotPays, skillRate = 1) {
  let e = 0;
  for (const r of SLOT_PROBS) {
    if (r.outcome === "trump") e += r.prob * p.cost;
    else if (r.outcome === "chance") e += r.prob * (p.chance + p.skill * skillRate);
    else e += r.prob * slotPayout(r.outcome, p);
  }
  return p.cost > 0 ? e / p.cost : Infinity;
}

export function pickOutcome(rng: Rng): SlotOutcome {
  let x = rng();
  for (const r of SLOT_PROBS) {
    if (x < r.prob) return r.outcome;
    x -= r.prob;
  }
  return "miss";
}

const pick = <T>(arr: readonly T[], rng: Rng) => arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];

/**
 * 結果に合うように、3つのリールの真ん中に止める絵柄を決める。
 * チャンスのときはリールは自由（目押し）なので使わない
 */
export function buildReels(outcome: SlotOutcome, rng: Rng): SlotSymbol[] {
  // ピンクの2はチャンスのときだけ。ふだんの回は2に止めない（すべりを短くするため）
  const normal = SLOT_SYMBOLS.filter((s) => s !== "two");
  const noCherry = normal.filter((s) => s !== "cherry");
  if (outcome === "cherry") {
    // 左だけチェリー。ほかの2つはそろえない
    const b = pick(noCherry, rng);
    let c = pick(noCherry, rng);
    if (b === c) c = noCherry[(noCherry.indexOf(c) + 1) % noCherry.length];
    return ["cherry", b, c];
  }
  if (outcome === "chance") return ["two", "two", "two"];
  if (outcome !== "miss") return [outcome, outcome, outcome];
  // 外れ：左はチェリー以外、3つ揃いにしない。ときどき「リーチ」（左と真ん中が同じ）で惜しくする
  const a = pick(noCherry, rng);
  const b = rng() < 0.25 ? a : pick(normal, rng);
  let c = pick(normal, rng);
  if (a === b && c === a) c = normal[(normal.indexOf(c) + 1) % normal.length];
  return [a, b, c];
}

/** 左と真ん中が同じ絵柄（リーチ演出を出す） */
export const isReach = (reels: string[]) => reels[0] === reels[1];

// ───── リールの並び（目押し用。サーバーと画面で同じものを使う） ─────

/**
 * 1本のリールに並ぶ16コマ。ピンクの2は1コマだけ（目押しの的）。
 * ほかの5つの絵柄は「どの6コマを取っても全部入っている」並びにして、押してからのすべりを最大5コマにおさえる
 */
const CYCLE: SlotSymbol[] = ["cherry", "bell", "grape", "bar", "trump"];
const BASE_STRIP: SlotSymbol[] = ["two", ...CYCLE, ...CYCLE, ...CYCLE];
/** ふだんの回で、押してから止まるまでにすべる最大のコマ数 */
export const MAX_SLIP = 5;
/** 3本のリールは同じ並びを少しずらして使う */
export const REEL_STRIPS: SlotSymbol[][] = [0, 5, 10].map((shift) => BASE_STRIP.map((_, i) => BASE_STRIP[(i + shift) % BASE_STRIP.length]));
export const STRIP_LEN = BASE_STRIP.length;

/** 目押しで止めた位置（各リールのコマ番号）が 2・2・2 か */
export function isTwoTwoTwo(stops: number[]) {
  return stops.length === 3 && stops.every((p, r) => Number.isInteger(p) && p >= 0 && p < STRIP_LEN && REEL_STRIPS[r][p] === "two");
}

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
