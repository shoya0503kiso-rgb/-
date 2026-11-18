// ページ・確認メールに載せる文面（仕様書 3・5・7章）
import { UNDER20_NOTE } from "./config";

export const CANCEL_POLICY: { item: string; dayBefore: string; sameDay: string }[] = [
  { item: "コース料金", dayBefore: "50%", sameDay: "100%" },
  { item: "オードブル", dayBefore: "50%", sameDay: "100%" },
  { item: "延長", dayBefore: "なし", sameDay: "なし" },
];
export const CANCEL_NOTES = ["人数が減った場合のキャンセル料はありません（料金は当日の人数で計算し直します）"];

export const PRICE_NOTE = "料金は当日ご来店の人数で計算し直します。人数が減って人数割引の段階が変わった場合は、新しい段階の料金になります。";

/** 注意事項。null の項目は文面が未定（しょうやに確認） */
export const NOTICES: { text: string | null; pending?: string }[] = [
  { text: "チップの換金・景品との交換はできません。" },
  { text: "当日の延長は、後ろにご予約が入っていない場合のみ承ります。" },
  { text: "お支払いは当日、現金でお願いします。" },
  { text: UNDER20_NOTE, pending: "20歳未満の方のご利用について（文面確認中）" },
];

export function cancelPolicyText() {
  return [
    "【キャンセル規定】",
    ...CANCEL_POLICY.map((p) => `・${p.item}：前日 ${p.dayBefore} ／ 当日 ${p.sameDay}`.replace("前日 なし ／ 当日 なし", "キャンセル料なし")),
    ...CANCEL_NOTES.map((n) => `・${n}`),
  ].join("\n");
}
