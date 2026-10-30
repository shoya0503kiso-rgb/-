// お店のイラスト（public/brand/ の画像）。差し替えるときは同じ名前のファイルを置き換える
export const IMG = {
  /** ロゴマーク（チップ）。透過 */
  mark: "/brand/logo-mark.webp",
  /** 「AMUSEMENT BAR MOCHI MOCHI」入りのロゴ。透過・黒文字なので明るい背景で使う */
  full: "/brand/logo-full.webp",
  /** チップを抱えたトラ。透過 */
  tigerChip: "/brand/tiger-chip.webp",
  /** シェイクを飲むトラ（MOCHI MOCHI 文字入り）。透過 */
  tigerShake: "/brand/tiger-shake.webp",
  /** ダーツのトラ。透過 */
  tigerDarts: "/brand/tiger-darts.webp",
  /** ピンク背景のトラ */
  tigerPink: "/brand/tiger-pink.webp",
  /** ポーカーテーブルのキング＆クイーン */
  poker: "/brand/poker-table.webp",
  /** サブマリン（ビールにテキーラ）を飲ませるクイーン */
  submarine: "/brand/submarine.webp",
} as const;
