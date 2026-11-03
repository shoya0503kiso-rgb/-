// 勤怠の一括取り込み（スマレジ等からの移行）。すでにある勤怠と時間が重なる行は取り込まない
import { guessEmployee, parseImportText, type ImportParseError, type ImportRow } from "@/lib/attendance/import";
import { jstAt } from "@/lib/time";
import { createSession, deleteSession, findOverlaps, type Editor } from "./attendance";
import { prisma } from "./db";
import { UserError } from "./errors";

export const IMPORT_REASON = "一括取り込み（以前の勤怠システムから移行）";
export const OVERWRITE_REASON = "一括取り込みで上書き";
const MAX_ROWS = 1000;

/** ok:取り込む / replace:登録済みを消して取り込む（上書き時） / exists:登録済みのため取り込まない */
export type ImportStatus = "ok" | "replace" | "exists" | "duplicate" | "unmapped";

export interface ImportPreviewRow extends ImportRow {
  employeeId: string | null;
  status: ImportStatus;
  /** 上書きで消える登録済みの勤怠 */
  replaces?: { id: string; clockIn: Date | null; clockOut: Date | null }[];
  /** 取り込むが要確認になるもの（退勤なし・長時間など） */
  warning?: string;
}

export interface ImportPreview {
  rows: ImportPreviewRow[];
  errors: ImportParseError[];
  /** ファイル中の名前 → 従業員ID（推測または指定） */
  mapping: Record<string, string | null>;
  counts: Record<ImportStatus, number>;
}

function toInput(r: ImportRow) {
  const clockIn = jstAt(r.date, r.inMinutes);
  const clockOut = r.outMinutes === null ? null : jstAt(r.date, r.outMinutes);
  const breaks: { start: Date; end: Date }[] = [];
  if (clockOut && r.breakMinutes > 0) {
    // 休憩の時刻は分からないため、勤務の真ん中にまとめて置く（合計時間は元のデータどおり）
    const startMin = r.inMinutes + Math.floor((r.outMinutes! - r.inMinutes - r.breakMinutes) / 2);
    breaks.push({ start: jstAt(r.date, startMin), end: jstAt(r.date, startMin + r.breakMinutes) });
  }
  return { clockIn, clockOut, breaks };
}

function warningOf(r: ImportRow): string | undefined {
  if (r.outMinutes === null) return "退勤なし（取り込み後に要確認に出ます）";
  if (r.outMinutes - r.inMinutes > 16 * 60) return "16時間を超える勤務";
  if (r.outMinutes - r.inMinutes < 30) return "30分未満の勤務";
  return undefined;
}

export async function previewImport(
  text: string,
  mappingOverride: Record<string, string | null> = {},
  opts: { overwrite?: boolean } = {},
): Promise<ImportPreview> {
  const { rows, errors } = parseImportText(text);
  if (rows.length > MAX_ROWS) throw new UserError(`一度に取り込めるのは${MAX_ROWS}行までです`);
  const employees = await prisma.employee.findMany({ select: { id: true, name: true, kana: true } });
  const ids = new Set(employees.map((e) => e.id));

  const mapping: Record<string, string | null> = {};
  for (const r of rows) {
    if (r.name in mapping) continue;
    const override = mappingOverride[r.name];
    mapping[r.name] = override !== undefined ? (override && ids.has(override) ? override : null) : guessEmployee(r.name, employees)?.id ?? null;
  }

  const accepted: { employeeId: string; start: number; end: number }[] = [];
  const result: ImportPreviewRow[] = [];
  for (const r of rows) {
    const employeeId = mapping[r.name];
    if (!employeeId) {
      result.push({ ...r, employeeId: null, status: "unmapped" });
      continue;
    }
    const v = toInput(r);
    const start = v.clockIn.getTime();
    const end = (v.clockOut ?? v.clockIn).getTime();
    const overlaps = await findOverlaps(employeeId, v);
    let status: ImportStatus = "ok";
    if (accepted.some((a) => a.employeeId === employeeId && start <= a.end && a.start <= end)) status = "duplicate";
    else if (overlaps.length) status = opts.overwrite ? "replace" : "exists";
    if (status === "ok" || status === "replace") accepted.push({ employeeId, start, end });
    result.push({
      ...r,
      employeeId,
      status,
      replaces: status === "replace" ? overlaps.map((o) => ({ id: o.id, clockIn: o.clockIn, clockOut: o.clockOut })) : undefined,
      warning: status === "ok" || status === "replace" ? warningOf(r) : undefined,
    });
  }

  const counts: Record<ImportStatus, number> = { ok: 0, replace: 0, exists: 0, duplicate: 0, unmapped: 0 };
  for (const r of result) counts[r.status]++;
  return { rows: result, errors, mapping, counts };
}

/** 確認画面と同じ判定をやり直し、「取り込む」「上書き」の行だけ登録する */
export async function applyImport(
  text: string,
  mapping: Record<string, string | null>,
  editor: Editor,
  opts: { overwrite?: boolean } = {},
) {
  const preview = await previewImport(text, mapping, opts);
  if (preview.errors.length) throw new UserError("読み取れない行があります。直してからもう一度確認してください");
  const targets = preview.rows.filter((r) => r.status === "ok" || r.status === "replace");
  if (!targets.length) throw new UserError("取り込める勤怠がありません");
  let created = 0;
  let replaced = 0;
  const deleted = new Set<string>();
  const failed: { line: number; error: string }[] = [];
  for (const r of targets) {
    try {
      // 消してから登録する（消した勤怠は履歴に残り、勤怠画面から確認できる）
      for (const o of r.replaces ?? []) {
        if (deleted.has(o.id)) continue; // 1件の長い勤務が複数の行と重なっていた場合
        await deleteSession(o.id, OVERWRITE_REASON, editor);
        deleted.add(o.id);
        replaced++;
      }
      await createSession(r.employeeId!, toInput(r), IMPORT_REASON, editor);
      created++;
    } catch (e) {
      if (!(e instanceof UserError)) throw e;
      failed.push({ line: r.line, error: e.message });
    }
  }
  return { created, replaced, skipped: preview.rows.length - targets.length, failed };
}
