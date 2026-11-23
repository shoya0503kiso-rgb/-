// 会員番号の見せ方（画面・管理画面で共通）

/** 1 → "No.0001" */
export function formatMemberNo(n: number | null | undefined) {
  return n == null ? "No.----" : `No.${String(n).padStart(4, "0")}`;
}

/** 検索欄に入れた「No.12」「0012」「12」を番号にする。番号でなければ null */
export function parseMemberNo(q: string) {
  const m = q.trim().match(/^(?:no\.?\s*)?0*(\d{1,9})$/i);
  return m ? Number(m[1]) : null;
}
