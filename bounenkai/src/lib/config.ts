// お店・企画の設定。仕様書で「まだ決まってないこと」は TODO_ の値（null / 空）にしてあり、
// 画面には「確認中」と出す。決まったらここを書き換える（docs/provisional.md 参照）。

export const STORE = {
  name: "9High福山",
  kind: "ポーカーバー",
  company: "No Limit株式会社",
  /** 住所・電話番号・地図は未定（しょうやに確認） */
  address: null as string | null,
  phone: null as string | null,
  mapUrl: null as string | null,
};

/** キャッチコピー（未定。仮の文言） */
export const CATCH_COPY = { text: "今年の忘年会は、カジノで。", provisional: true };

/** 料金が税込かどうか（未定）。true=税込 / false=税別 / null=未定 */
export const TAX_INCLUDED: boolean | null = null;

/** スタート時間の刻み（分）。30分刻みは仮（しょうやに確認） */
export const START_STEP_MIN = 30;
export const START_STEP_PROVISIONAL = true;

/** 20歳未満の方の扱い（未定）。決まったら文面を入れる */
export const UNDER20_NOTE: string | null = null;
