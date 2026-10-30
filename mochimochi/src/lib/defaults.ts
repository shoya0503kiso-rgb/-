// 初期値（すべて仮）。DBが空のときだけ入れる。運用開始後は管理画面「設定」「交換」で変更する

export const DEFAULT_RANKS = [
  { name: "ビギナー", minVisits: 0, color: "#94a3b8" },
  { name: "ブロンズ", minVisits: 5, color: "#b45309" },
  { name: "シルバー", minVisits: 15, color: "#64748b" },
  { name: "ゴールド", minVisits: 30, color: "#ca8a04" },
  { name: "プラチナ", minVisits: 60, color: "#0e7490" },
  { name: "もちもちマスター", minVisits: 100, color: "#db2777" },
];

/** 順位ごとのポイント（i 番目 = i+1 位） */
export const DEFAULT_PLACE_POINTS: Record<string, number[]> = {
  darts: [100, 50, 30, 10],
  poker: [100, 50, 30, 10],
};

export const DEFAULT_REWARDS = [
  { name: "ソフトドリンク1杯（仮）", cost: 300, sortOrder: 1 },
  { name: "お好きなドリンク1杯（仮）", cost: 600, sortOrder: 2 },
  { name: "テーブルチャージ無料（仮）", cost: 1000, sortOrder: 3 },
];
