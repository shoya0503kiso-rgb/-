import { IMG } from "./brand-images";

// ホームの会員カードの色と右下のとらんぷちゃん。ランクの順番（下から）で決まる。
// ランクが5つ以上になったら、5つ目からは一番上の見た目を使う

export type RankTheme = { card: string; label: string; points: string; unit: string; img: string; imgPos?: string; badge?: string };

export const RANK_THEMES: RankTheme[] = [
  // おこめ：お米の白・クリーム
  {
    card: "bg-gradient-to-br from-[#fffdf7] via-[#f8f1e1] to-[#eadfc6] text-stone-800 ring-1 ring-stone-200",
    label: "text-stone-500",
    points: "text-rose-600",
    unit: "text-stone-700",
    img: IMG.rankIcons[0],
    badge: "ring-1 ring-stone-300",
  },
  // しらたま：ピンク
  {
    card: "bg-gradient-to-br from-pink-300 via-pink-400 to-rose-500 text-white",
    label: "text-white/85",
    points: "text-white drop-shadow-[0_2px_0_rgba(190,18,60,.45)]",
    unit: "text-white",
    img: IMG.rankIcons[1],
  },
  // だいふく：よもぎの緑
  {
    card: "bg-gradient-to-br from-emerald-400 via-green-500 to-green-700 text-white",
    label: "text-white/85",
    points: "text-white drop-shadow-[0_2px_0_rgba(20,83,45,.5)]",
    unit: "text-white",
    img: IMG.rankIcons[2],
  },
  // かがみもち：黒と金（一番上）
  {
    card: "bg-gradient-to-br from-neutral-950 via-neutral-900 to-amber-900 text-amber-50 ring-2 ring-amber-400/70",
    label: "text-amber-100/80",
    points: "text-amber-300",
    unit: "text-amber-50",
    img: IMG.rankIcons[3],
    // 横長の絵なので、下を切らないように少し上げる
    imgPos: "-right-1 bottom-1 w-40",
  },
];

export const rankTheme = (level: number) => RANK_THEMES[Math.min(Math.max(0, level), RANK_THEMES.length - 1)];
