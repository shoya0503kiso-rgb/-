// 初期値（すべて仮）。DBが空のときだけ入れる。運用開始後は管理画面「設定」「交換」で変更する

/** 来店回数で上がる。かがみもちは難しめ */
export const DEFAULT_RANKS = [
  { name: "おこめ", minVisits: 0, color: "#a8a29e" },
  { name: "しらたま", minVisits: 15, color: "#ec4899" },
  { name: "だいふく", minVisits: 30, color: "#16a34a" },
  { name: "かがみもち", minVisits: 100, color: "#d97706" },
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
