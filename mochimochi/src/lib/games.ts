// ミニゲームの勝敗判定（乱数は引数で受け取り、テストできるようにする）
export type Rng = () => number;

export const HANDS = ["rock", "scissors", "paper"] as const;
export type Hand = (typeof HANDS)[number];
export const HAND_LABEL: Record<Hand, string> = { rock: "グー", scissors: "チョキ", paper: "パー" };

export type Outcome = "win" | "lose" | "draw";

export function judgeJanken(player: Hand, house: Hand): Outcome {
  if (player === house) return "draw";
  const beats: Record<Hand, Hand> = { rock: "scissors", scissors: "paper", paper: "rock" };
  return beats[player] === house ? "win" : "lose";
}

export function randomHand(rng: Rng): Hand {
  return HANDS[Math.min(2, Math.floor(rng() * 3))];
}

// ───── チンチロ ─────
// 強さ: ピンゾロ(1,1,1) > ゾロ目(6〜2) > シゴロ(4,5,6) > 目(6〜1) > 目なし > ヒフミ(1,2,3)
// 目なしは3回まで振り直し。3回とも目なしなら「目なし」で確定

export interface ChinchiroHand {
  dice: number[];
  name: string;
  /** 比較用の強さ（大きいほど強い） */
  score: number;
  /** 役（ピンゾロ・ゾロ目・シゴロ） */
  big: boolean;
}

export function evalChinchiro(dice: number[]): ChinchiroHand {
  const s = [...dice].sort((a, b) => a - b);
  const [a, b, c] = s;
  if (a === b && b === c) {
    if (a === 1) return { dice, name: "ピンゾロ", score: 1000, big: true };
    return { dice, name: `${a}のゾロ目`, score: 900 + a, big: true };
  }
  if (a === 4 && b === 5 && c === 6) return { dice, name: "シゴロ", score: 800, big: true };
  if (a === 1 && b === 2 && c === 3) return { dice, name: "ヒフミ", score: -100, big: false };
  if (a === b) return { dice, name: `${c}の目`, score: 100 + c, big: false };
  if (b === c) return { dice, name: `${a}の目`, score: 100 + a, big: false };
  return { dice, name: "目なし", score: 0, big: false };
}

const rollDie = (rng: Rng) => Math.min(6, Math.floor(rng() * 6) + 1);

/** 目が出るまで最大3回振る。rolls に全部の出目を残す */
export function rollChinchiro(rng: Rng): { rolls: number[][]; hand: ChinchiroHand } {
  const rolls: number[][] = [];
  let hand = evalChinchiro([1, 2, 4]);
  for (let i = 0; i < 3; i++) {
    const dice = [rollDie(rng), rollDie(rng), rollDie(rng)];
    rolls.push(dice);
    hand = evalChinchiro(dice);
    if (hand.name !== "目なし") break;
  }
  return { rolls, hand };
}

export function judgeChinchiro(player: ChinchiroHand, house: ChinchiroHand): Outcome {
  if (player.score === house.score) return "draw";
  return player.score > house.score ? "win" : "lose";
}
