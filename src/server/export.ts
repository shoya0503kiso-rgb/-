// 社労士提出用データ（CSV / Excel）。P-15
import ExcelJS from "exceljs";
import { totalsOf } from "@/lib/attendance/calc";
import { datesOfMonth, formatDuration, formatTime, WEEKDAY_JA, weekdayOf, type YearMonth } from "@/lib/time";
import { exportRows } from "./attendance";

const HEADER = ["従業員名", "日付", "曜日", "出勤", "退勤", "休憩", "実働時間", "備考"];

type Row = Awaited<ReturnType<typeof exportRows>>[number];

function toCells(r: Row): string[] {
  const s = r.session;
  const note = [!s.clockIn ? "出勤打刻なし" : "", !s.clockOut ? "退勤打刻なし" : ""].filter(Boolean).join("・");
  return [
    r.employee.name,
    s.businessDate,
    WEEKDAY_JA[weekdayOf(s.businessDate)],
    formatTime(s.clockIn, s.businessDate),
    formatTime(s.clockOut, s.businessDate),
    formatDuration(r.summary.breakMinutes),
    formatDuration(r.summary.workMinutes),
    note,
  ];
}

const csvEscape = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Excel で文字化けしないよう BOM 付き UTF-8 */
export async function buildCsv(ym: YearMonth, employeeId?: string): Promise<string> {
  const rows = await exportRows(ym, employeeId);
  const lines = [HEADER, ...rows.map(toCells)].map((cells) => cells.map(csvEscape).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}

export async function buildXlsx(ym: YearMonth, employeeId?: string): Promise<Buffer> {
  const rows = await exportRows(ym, employeeId);
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  const byEmployee = new Map<string, Row[]>();
  for (const r of rows) byEmployee.set(r.employee.id, [...(byEmployee.get(r.employee.id) ?? []), r]);

  // 集計シート
  const summary = wb.addWorksheet("集計");
  summary.addRow([`${ym} 勤怠集計`]).font = { bold: true, size: 14 };
  summary.addRow([]);
  const sh = summary.addRow(["従業員名", "勤務日数", "総実働時間", "総休憩時間", "未完了の勤怠"]);
  sh.font = { bold: true };
  for (const list of byEmployee.values()) {
    const t = totalsOf(list.map((r) => ({ ...r.session })));
    summary.addRow([list[0].employee.name, t.workDays, formatDuration(t.workMinutes), formatDuration(t.breakMinutes), t.incompleteCount || ""]);
  }
  summary.columns.forEach((c) => (c.width = 16));

  // スタッフ別シート（月の全日を表示）
  for (const list of byEmployee.values()) {
    const name = list[0].employee.name.replace(/[\\/?*[\]:]/g, "").slice(0, 28) || "従業員";
    let sheetName = name;
    for (let i = 2; wb.getWorksheet(sheetName); i++) sheetName = `${name}(${i})`;
    const ws = wb.addWorksheet(sheetName);
    ws.addRow([`${list[0].employee.name}　${ym}`]).font = { bold: true, size: 13 };
    const h = ws.addRow(HEADER.slice(1));
    h.font = { bold: true };
    for (const date of datesOfMonth(ym)) {
      const sessions = list.filter((r) => r.session.businessDate === date);
      if (sessions.length === 0) {
        ws.addRow([date, WEEKDAY_JA[weekdayOf(date)]]);
      } else {
        for (const r of sessions) ws.addRow(toCells(r).slice(1));
      }
    }
    const t = totalsOf(list.map((r) => r.session));
    ws.addRow([]);
    ws.addRow(["合計", "", "", "", formatDuration(t.breakMinutes), formatDuration(t.workMinutes), `勤務日数 ${t.workDays}日`]).font = { bold: true };
    ws.columns.forEach((c, i) => (c.width = i === 0 ? 13 : i === 6 ? 24 : 10));
  }

  // 全明細
  const all = wb.addWorksheet("全明細");
  all.addRow(HEADER).font = { bold: true };
  rows.forEach((r) => all.addRow(toCells(r)));
  all.columns.forEach((c, i) => (c.width = i === 0 ? 14 : i === 1 ? 12 : i === 7 ? 24 : 10));

  return Buffer.from(await wb.xlsx.writeBuffer());
}
