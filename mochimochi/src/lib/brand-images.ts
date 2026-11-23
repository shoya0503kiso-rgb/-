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
  /** ランキング：ダーツを投げるクイーンとキング（白背景） */
  rankDarts: "/brand/ranking-darts.webp",
  /** ランキング：ポーカーテーブルのクイーンとキング（白背景） */
  rankPoker: "/brand/ranking-poker.webp",
  /** ランキング：サブマリン（ビールにテキーラ）を飲ませるクイーン（白背景） */
  rankSubmarine: "/brand/ranking-submarine.webp",
  /** なでなで画面：寝ているとらんぷちゃん（3枚とも同じ構図・同じ大きさ） */
  trumpSleep: "/brand/trump-sleep.webp",
  /** なでなで画面：なでられてむにゃむにゃ */
  trumpDrowsy: "/brand/trump-drowsy.webp",
  /** なでなで画面：起きたとらんぷちゃん */
  trumpAwake: "/brand/trump-awake.webp",
  /** ホームの会員カード右下のとらんぷちゃん（ランクの順：おこめ・しらたま・だいふく・かがみもち）。透過 */
  rankIcons: ["/brand/rank-1.webp", "/brand/rank-2.webp", "/brand/rank-3.webp", "/brand/rank-4.webp"],
} as const;
