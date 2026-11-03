// 勤怠の一括取り込み（スマレジ等からの移行用）の入力解析。DB非依存。
// 1行1勤務：名前,日付,出勤,退勤,休憩
//   日付 … 出勤した日（2026-10-02 / 2026/10/2）
//   出勤・退勤 … HH:MM。退勤が出勤以前の時刻なら翌日の退勤。退勤が空なら退勤なし（要確認になる）
//   休憩 … 分（90）または H:MM（1:30）。空なら0
import { isValidDateStr, toDateStr, type DateStr } from "../time";

export interface ImportRow {
  line: number;
  name: string;
  date: DateStr;
  /** 出勤（0:00からの分） */
  inMinutes: number;
  /** 退勤（出勤日0:00からの分、日跨ぎは1440以上）。null は退勤なし */
  outMinutes: number | null;
  breakMinutes: number;
}

export interface ImportParseError {
  line: number;
  text: string;
  error: string;
}

const hm = (s: string): number | null => {
  const m = /^(\d{1,2})[:：](\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
};

const toHalfWidth = (s: string) =>
  s.replace(/[０-９：／－，]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/、/g, ",");

function parseDate(s: string): DateStr | null {
  const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(s);
  if (!m) return null;
  const d = toDateStr(Number(m[1]), Number(m[2]), Number(m[3]));
  return isValidDateStr(d) ? d : null;
}

function parseBreak(s: string): number | null {
  if (!s) return 0;
  if (/^\d+$/.test(s)) return Number(s);
  return hm(s);
}

export function parseImportText(text: string): { rows: ImportRow[]; errors: ImportParseError[] } {
  const rows: ImportRow[] = [];
  const errors: ImportParseError[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    const s = toHalfWidth(raw).trim();
    if (!s || s.startsWith("#")) return;
    const cells = s.split(/[,\t]/).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (cells[0] === "名前") return; // 見出し行
    const fail = (error: string) => errors.push({ line, text: raw, error });
    const [name, dateText, inText, outText = "", breakText = ""] = cells;
    if (!name) return fail("名前がありません");
    const date = parseDate(dateText ?? "");
    if (!date) return fail("日付が正しくありません（例：2026-10-02）");
    const inMinutes = hm(inText ?? "");
    if (inMinutes === null) return fail("出勤時刻が正しくありません（例：17:58）");
    let outMinutes: number | null = null;
    if (outText) {
      const out = hm(outText);
      if (out === null) return fail("退勤時刻が正しくありません（例：00:11）");
      outMinutes = out <= inMinutes ? out + 1440 : out;
    }
    const breakMinutes = parseBreak(breakText);
    if (breakMinutes === null) return fail("休憩が正しくありません（分、または 1:30 の形）");
    if (breakMinutes > 0 && outMinutes === null) return fail("退勤がない勤務に休憩は入れられません");
    if (outMinutes !== null && breakMinutes >= outMinutes - inMinutes) return fail("休憩が勤務時間より長くなっています");
    rows.push({ line, name, date, inMinutes, outMinutes, breakMinutes });
  });
  return { rows, errors };
}

/** 空白を除き、カタカナをひらがなにそろえる */
const squash = (s: string) => s.replace(/[\s　]/g, "").replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

/** 取り込みファイルの名前に合う従業員を推測する（完全一致 → 空白無視 → ふりがな → 部分一致が1人だけ。カタカナとひらがなは同じとみなす） */
export function guessEmployee<E extends { id: string; name: string; kana: string }>(name: string, employees: E[]): E | null {
  const n = squash(name);
  const tests: ((e: E) => boolean)[] = [
    (e) => e.name === name,
    (e) => squash(e.name) === n,
    (e) => !!e.kana && squash(e.kana) === n,
    (e) => squash(e.name).includes(n) || n.includes(squash(e.name)) || (!!e.kana && squash(e.kana).includes(n)),
  ];
  for (const test of tests) {
    const hit = employees.filter(test);
    if (hit.length === 1) return hit[0];
    if (hit.length > 1) return null;
  }
  return null;
}
