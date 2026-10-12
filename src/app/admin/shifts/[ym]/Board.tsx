"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, Badge, Button, Card, cx, Input } from "@/components/ui";
import { formatDateJa, formatHmRange, WEEKDAY_JA, weekdayOf } from "@/lib/time";
import type { ActionResult } from "@/server/errors";
import type { boardData, GenerationReport } from "@/server/shifts/board";
import { generateAction, publishAction, setAssignmentAction } from "../actions";

type Data = Awaited<ReturnType<typeof boardData>>;
type Pattern = { id: string; name: string; startTime: string; endTime: string; active: boolean };

const PATTERN_COLORS = ["bg-sky-600", "bg-violet-600", "bg-amber-600", "bg-emerald-600", "bg-rose-600"];

export function Board({
  ym,
  status,
  unpublished,
  dates,
  patterns,
  rows,
  fill,
  violations,
  report,
}: {
  ym: string;
  status: string;
  unpublished: boolean;
  dates: Data["dates"];
  patterns: Pattern[];
  rows: Data["rows"];
  fill: Data["fill"];
  violations: Data["violations"];
  report: (GenerationReport & { createdAt: string; createdBy: string }) | null;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ error?: string; message?: string; warnings?: string[] } | null>(null);
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<{ employeeId: string; name: string; date: string; current: Data["rows"][number]["days"][number] } | null>(null);
  const [custom, setCustom] = useState({ startTime: "20:00", endTime: "05:00" });
  const color = new Map(patterns.map((p, i) => [p.id, PATTERN_COLORS[i % PATTERN_COLORS.length]]));
  const patternName = new Map(patterns.map((p) => [p.id, p.name]));
  const collecting = status === "PREPARING" || status === "COLLECTING";

  const run = (fn: () => Promise<ActionResult<unknown>>, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    start(async () => {
      const r = await fn();
      if (!r.ok) setMsg({ error: r.error });
      else if (Array.isArray(r.data)) setMsg(r.data.length ? { warnings: r.data as string[] } : null);
      else setMsg({ message: String(r.data ?? r.message ?? "完了しました") });
      router.refresh();
    });
  };

  const assign = (choice: Parameters<typeof setAssignmentAction>[3]) => {
    if (!editing) return;
    const e = editing;
    setEditing(null);
    run(() => setAssignmentAction(ym, e.date, e.employeeId, choice));
  };

  const shortTotal = fill.reduce((s, f) => s + Math.max(0, f.required - f.assigned), 0);
  const publishWarnings = [
    shortTotal ? `※ まだ ${shortTotal}人分の不足があります` : "",
    violations.length ? `※ 絶対条件に反する配置が ${violations.length}件あります（上の一覧を確認してください）` : "",
  ].filter(Boolean).join("\n");

  return (
    <div className="space-y-4">
      {collecting && <Alert kind="warn">希望の受付中です。「① 提出状況」で受付を終了してからシフトを作成してください。</Alert>}
      {msg?.error && <Alert kind="error">{msg.error}</Alert>}
      {msg?.message && <Alert kind="success">{msg.message}</Alert>}
      {msg?.warnings && (
        <Alert kind="warn">
          配置しました。ただし次の点を確認してください：
          <ul className="list-disc pl-5">{msg.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </Alert>
      )}

      <Card title="作成・公開">
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={pending || collecting} onClick={() => run(() => generateAction(ym, true), "希望と条件からシフト案を自動作成しますか？（手動で入れた配置は残します）")}>
            自動作成（手動配置は残す）
          </Button>
          <Button
            variant="secondary"
            disabled={pending || collecting}
            onClick={() =>
              run(
                () => generateAction(ym, false),
                status === "PUBLISHED"
                  ? "公開済みのシフトを手動の配置も含めてすべて作り直しますか？\n公開し直すと、多くのスタッフに変更通知が送られます。"
                  : "手動の配置も含めてすべて作り直しますか？",
              )
            }
          >
            すべて作り直す
          </Button>
          <span className="mx-2 hidden h-6 w-px bg-slate-200 sm:block" />
          {status !== "PUBLISHED" ? (
            <Button
              variant="primary"
              disabled={pending || collecting}
              onClick={() => run(() => publishAction(ym), `シフトを確定して公開し、全員にLINEで通知しますか？${publishWarnings ? `\n${publishWarnings}` : ""}`)}
            >
              確定して公開・通知
            </Button>
          ) : unpublished ? (
            <Button disabled={pending} onClick={() => run(() => publishAction(ym), `変更を公開し、変更があったスタッフにだけLINEで通知しますか？${publishWarnings ? `\n${publishWarnings}` : ""}`)}>
              変更を公開・通知
            </Button>
          ) : (
            <Badge color="green">公開済み（最新の内容を通知済み）</Badge>
          )}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          自動作成は「案」を作るだけです。内容を確認・修正してから公開してください。表のマスをタップすると配置を変更できます（手動の配置は再作成しても残ります）。
        </p>
      </Card>

      {violations.length > 0 && (
        <Card title={<span className="text-red-700">絶対条件に反する配置 {violations.length}件</span>}>
          <ul className="space-y-1 text-sm">
            {violations.map((v, i) => (
              <li key={i}>
                {v.date && `${formatDateJa(v.date)} `}
                <b>{v.employeeName}</b>：{v.message}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">作成後に店休日・相性条件・最大日数を変えた場合などに出ます。店長の判断で残す場合はそのまま公開できます。</p>
        </Card>
      )}

      {report && <ReportView report={report} patternName={patternName} />}

      <Card title={`シフト表${shortTotal ? `（不足 ${shortTotal}人）` : ""}`}>
        <div className="mb-2 flex flex-wrap gap-3 text-xs text-slate-600">
          {patterns.filter((p) => p.active).map((p) => (
            <span key={p.id} className="flex items-center gap-1">
              <span className={cx("inline-block h-3 w-3 rounded", color.get(p.id))} />
              {p.name} {formatHmRange(p.startTime, p.endTime)}
            </span>
          ))}
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border border-teal-300 bg-teal-50" />希望○</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-slate-200" />不可・未提出</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded ring-2 ring-orange-400" />手動配置</span>
        </div>
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-24 border-b border-slate-200 bg-white px-2 py-1 text-left">スタッフ</th>
                <th className="border-b border-slate-200 px-1 py-1">日数</th>
                {dates.map((d) => {
                  const w = weekdayOf(d.date);
                  return (
                    <th key={d.date} className={cx("min-w-9 border-b border-slate-200 px-0.5 py-1 font-normal", (d.holiday || w === 0) && "text-red-600", w === 6 && !d.holiday && "text-blue-600", d.closed && "bg-slate-300")}>
                      <div>{Number(d.date.slice(8))}</div>
                      <div>{WEEKDAY_JA[w]}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.employee.id}>
                  <td className="sticky left-0 z-10 border-b border-slate-100 bg-white px-2 py-1 whitespace-nowrap">
                    <div className="font-medium">{r.employee.name}</div>
                    {!r.submitted && <span className="text-[10px] text-red-600">希望未提出</span>}
                    {r.condition && (r.condition.maxDays !== null || r.condition.volume !== "NORMAL") && (
                      <span className="text-[10px] text-slate-500">
                        {r.condition.volume === "MORE" ? "多め " : r.condition.volume === "LESS" ? "少なめ " : ""}
                        {r.condition.maxDays !== null ? `最大${r.condition.maxDays}` : ""}
                      </span>
                    )}
                  </td>
                  <td className="border-b border-slate-100 px-1 text-center font-bold">{r.total}</td>
                  {r.days.map((d, i) => {
                    const closed = dates[i].closed;
                    const a = d.assignment;
                    return (
                      <td key={d.date} className={cx("border-b border-slate-100 p-0.5", closed ? "bg-slate-300" : d.available ? "bg-teal-50" : "bg-slate-100")}>
                        <button
                          type="button"
                          disabled={pending || collecting}
                          aria-label={`${r.employee.name} ${formatDateJa(d.date)}`}
                          title={[d.available ? "希望○" : "不可/未提出", d.requestTime && `希望 ${d.requestTime}`, d.requestPatternId && `希望枠 ${patternName.get(d.requestPatternId) ?? ""}`].filter(Boolean).join(" / ")}
                          onClick={() => setEditing({ employeeId: r.employee.id, name: r.employee.name, date: d.date, current: d })}
                          className={cx(
                            "flex h-8 w-8 items-center justify-center rounded text-[11px] font-bold",
                            a ? cx("text-white", a.patternId ? color.get(a.patternId) : "bg-slate-600") : "text-teal-700/40",
                            a?.source === "MANUAL" && "ring-2 ring-orange-400",
                          )}
                        >
                          {a ? (a.patternId ? (patternName.get(a.patternId) ?? "?").slice(0, 1) : a.startTime.slice(0, 2)) : d.available ? "○" : ""}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              {patterns.filter((p) => p.active).map((p) => (
                <tr key={p.id}>
                  <td className="sticky left-0 z-10 bg-white px-2 py-1 text-slate-600 whitespace-nowrap">{p.name} 人数</td>
                  <td />
                  {dates.map((d) => {
                    const f = fill.find((x) => x.date === d.date && x.patternId === p.id);
                    if (!f || f.required === 0) return <td key={d.date} className="text-center text-slate-300">{f ? f.assigned || "" : ""}</td>;
                    const short = f.assigned < f.required;
                    return (
                      <td key={d.date} className={cx("text-center", short ? "bg-red-100 font-bold text-red-700" : "text-slate-500")}>
                        {f.assigned}/{f.required}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tfoot>
          </table>
        </div>
      </Card>

      {editing && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setEditing(null)}>
          <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="配置の変更">
            <div className="mb-1 text-lg font-bold">{editing.name}さん　{formatDateJa(editing.date)}</div>
            <div className="mb-3 text-sm text-slate-600">
              希望：{editing.current.available ? "○ 出勤可" : "× 不可・未提出"}
              {editing.current.requestPatternId && `（${patternName.get(editing.current.requestPatternId) ?? ""}希望）`}
              {editing.current.requestTime && `（${editing.current.requestTime}）`}
            </div>
            <div className="space-y-2">
              {patterns.filter((p) => p.active).map((p) => (
                <button
                  key={p.id}
                  onClick={() => assign({ patternId: p.id })}
                  className={cx("flex w-full items-center justify-between rounded-lg px-4 py-3 text-left font-bold text-white", color.get(p.id), editing.current.assignment?.patternId === p.id && "ring-4 ring-orange-300")}
                >
                  <span>{p.name}</span>
                  <span className="text-sm font-normal">{formatHmRange(p.startTime, p.endTime)}</span>
                </button>
              ))}
              <div className="flex items-center gap-1 rounded-lg border border-slate-200 p-2">
                <Input type="time" aria-label="開始" value={custom.startTime} onChange={(e) => setCustom({ ...custom, startTime: e.target.value })} className="w-28 py-1" />
                〜
                <Input type="time" aria-label="終了" value={custom.endTime} onChange={(e) => setCustom({ ...custom, endTime: e.target.value })} className="w-28 py-1" />
                <Button size="sm" variant="secondary" onClick={() => assign({ custom })}>時間指定</Button>
              </div>
              {editing.current.assignment && (
                <Button variant="danger" className="w-full" onClick={() => assign(null)}>この日の配置を外す</Button>
              )}
              <Button variant="ghost" className="w-full" onClick={() => setEditing(null)}>キャンセル</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReportView({ report, patternName }: { report: GenerationReport & { createdAt: string; createdBy: string }; patternName: Map<string, string> }) {
  const notes = report.staff.filter((s) => s.notes.length);
  return (
    <Card title="自動作成レポート（作成時点）" actions={<span className="text-xs text-slate-500">{new Date(report.createdAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })} {report.createdBy}</span>}>
      {report.shortages.length === 0 && notes.length === 0 && report.warnings.length === 0 ? (
        <p className="text-sm text-emerald-700">必要人数・条件をすべて満たしました。</p>
      ) : (
        <div className="space-y-3 text-sm">
          {report.shortages.length > 0 && (
            <div>
              <div className="mb-1 font-bold text-red-700">人数不足</div>
              <ul className="space-y-1">
                {report.shortages.map((s) => (
                  <li key={`${s.date}|${s.patternId}`}>
                    {formatDateJa(s.date)} {patternName.get(s.patternId) ?? ""}：<b>{s.required - s.assigned}人不足</b>
                    <span className="text-slate-500">（その日に出勤可：{s.candidates.length ? s.candidates.join("、") : "なし"}）</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-slate-500">（）内は入れられなかった理由です。本人に相談して手動で入れるか、必要人数・最大日数を見直してください（自動では「出勤不可」の人を入れません）。</p>
            </div>
          )}
          {notes.length > 0 && (
            <div>
              <div className="mb-1 font-bold text-amber-800">守れなかった希望条件</div>
              <ul className="list-disc pl-5">
                {notes.map((s) => <li key={s.id}>{s.name}：{s.notes.join("、")}</li>)}
              </ul>
            </div>
          )}
          {report.warnings.length > 0 && (
            <ul className="list-disc pl-5 text-amber-800">{report.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          )}
        </div>
      )}
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-slate-600">スタッフ別の日数</summary>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          {report.staff.map((s) => (
            <li key={s.id}>
              {s.name}：<b>{s.days}日</b>
              <span className="text-slate-500">（目標 {s.target} / 希望○ {s.availableDays}{s.maxDays !== null ? ` / 最大 ${s.maxDays}` : ""}{s.minDays !== null ? ` / 最低 ${s.minDays}` : ""}）</span>
            </li>
          ))}
        </ul>
      </details>
    </Card>
  );
}
