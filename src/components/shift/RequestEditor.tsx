"use client";
// シフト希望の入力（スタッフのスマホ用。管理者の代理入力でも使う）
import { useState, useTransition } from "react";
import { Alert, Button, cx, Textarea } from "@/components/ui";
import { formatDateJa, formatHmRange } from "@/lib/time";
import type { ActionResult } from "@/server/errors";
import type { RequestDayInput } from "@/server/shifts/requests";

export interface EditorDay {
  date: string;
  closed: boolean;
  holiday: boolean;
  availability: "OK" | "NG" | null;
  patternId: string | null;
  startTime: string | null;
  endTime: string | null;
}

export interface EditorPattern {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
}

export function RequestEditor({
  initialDays,
  initialComment,
  patterns,
  readOnly,
  onSubmit,
  submitLabel = "提出する",
}: {
  initialDays: EditorDay[];
  initialComment: string;
  patterns: EditorPattern[];
  readOnly: boolean;
  onSubmit: (days: RequestDayInput[], comment: string) => Promise<ActionResult<{ okDays: number }>>;
  submitLabel?: string;
}) {
  const [days, setDays] = useState(initialDays);
  const [comment, setComment] = useState(initialComment);
  const [result, setResult] = useState<{ error?: string; message?: string } | null>(null);
  const [pending, start] = useTransition();

  const update = (date: string, patch: Partial<EditorDay>) => {
    setResult(null);
    setDays((ds) => ds.map((d) => (d.date === date ? { ...d, ...patch } : d)));
  };
  const setAll = (availability: "OK" | "NG") =>
    setDays((ds) => ds.map((d) => (d.closed ? d : { ...d, availability })));
  const okCount = days.filter((d) => d.availability === "OK" && !d.closed).length;

  function submit() {
    start(async () => {
      const payload: RequestDayInput[] = days
        .filter((d) => d.availability)
        .map((d) => ({
          date: d.date,
          availability: d.availability!,
          patternId: d.patternId,
          startTime: d.startTime || null,
          endTime: d.endTime || null,
        }));
      const r = await onSubmit(payload, comment);
      setResult(r.ok ? { message: `${r.message ?? "提出しました"}（出勤可 ${r.data?.okDays ?? okCount}日）` } : { error: r.error });
      if (r.ok) window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  return (
    <div className="pb-28">
      {result?.message && <div className="mb-3"><Alert kind="success">{result.message}</Alert></div>}
      {!readOnly && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="text-sm text-slate-600">未選択の日は「×（不可）」になります</span>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setAll("OK")}>全部○</Button>
            <Button size="sm" variant="secondary" onClick={() => setAll("NG")}>全部×</Button>
          </div>
        </div>
      )}
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {days.map((d) => (
          <li key={d.date} className={cx("px-3 py-2", d.availability === "OK" && !d.closed && "bg-teal-50/60")}>
            <div className="flex items-center justify-between gap-2">
              <span className={cx("w-24 font-medium", d.holiday && "text-red-600")}>{formatDateJa(d.date)}</span>
              {d.closed ? (
                <span className="text-sm text-slate-400">店休日</span>
              ) : (
                <div className="flex gap-2">
                  {(["OK", "NG"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      disabled={readOnly}
                      aria-pressed={d.availability === v}
                      aria-label={`${formatDateJa(d.date)} ${v === "OK" ? "出勤可" : "不可"}`}
                      onClick={() => update(d.date, { availability: d.availability === v ? null : v })}
                      className={cx(
                        "h-11 w-16 rounded-lg border-2 text-lg font-bold",
                        d.availability === v
                          ? v === "OK"
                            ? "border-teal-700 bg-teal-700 text-white"
                            : "border-slate-500 bg-slate-500 text-white"
                          : "border-slate-200 bg-white text-slate-400",
                      )}
                    >
                      {v === "OK" ? "○" : "×"}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {d.availability === "OK" && !d.closed && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                {patterns.length > 0 && (
                  <select
                    disabled={readOnly}
                    value={d.patternId ?? ""}
                    onChange={(e) => update(d.date, { patternId: e.target.value || null })}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1.5"
                    aria-label={`${formatDateJa(d.date)} 希望の枠`}
                  >
                    <option value="">どの枠でも可</option>
                    {patterns.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}（{formatHmRange(p.startTime, p.endTime)}）</option>
                    ))}
                  </select>
                )}
                <TimeRange
                  disabled={readOnly}
                  start={d.startTime}
                  end={d.endTime}
                  onChange={(startTime, endTime) => update(d.date, { startTime, endTime })}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-4">
        <label className="mb-1 block text-sm font-medium">店長へのメモ（任意）</label>
        <Textarea rows={3} value={comment} disabled={readOnly} onChange={(e) => setComment(e.target.value)} placeholder="例：テスト期間のため11/20〜は少なめ希望" />
      </div>
      {result?.error && <div className="mt-3"><Alert kind="error">{result.error}</Alert></div>}
      {!readOnly && (
        <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 p-3 backdrop-blur">
          <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
            <span className="text-sm">出勤可 <b className="text-lg">{okCount}</b> 日</span>
            <Button onClick={submit} disabled={pending} className="min-w-40 py-3 text-lg">{pending ? "送信中…" : submitLabel}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function TimeRange({ start, end, disabled, onChange }: { start: string | null; end: string | null; disabled: boolean; onChange: (s: string | null, e: string | null) => void }) {
  const [open, setOpen] = useState(!!start);
  if (!open) {
    return disabled ? null : (
      <button type="button" className="text-teal-700 underline" onClick={() => setOpen(true)}>
        時間を指定
      </button>
    );
  }
  return (
    <span className="flex items-center gap-1">
      <input type="time" disabled={disabled} value={start ?? ""} onChange={(e) => onChange(e.target.value, end)} className="rounded-lg border border-slate-300 px-2 py-1" aria-label="希望開始" />
      〜
      <input type="time" disabled={disabled} value={end ?? ""} onChange={(e) => onChange(start, e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1" aria-label="希望終了" />
      {!disabled && (
        <button type="button" className="ml-1 text-slate-500 underline" onClick={() => { setOpen(false); onChange(null, null); }}>
          解除
        </button>
      )}
    </span>
  );
}
