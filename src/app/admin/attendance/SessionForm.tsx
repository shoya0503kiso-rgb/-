"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, Button, Field, Input, Textarea } from "@/components/ui";
import { deleteSessionAction, saveSessionAction, type SessionFormValue } from "./actions";

export function SessionForm({
  sessionId,
  employeeId,
  version,
  initial,
}: {
  sessionId: string | null;
  employeeId: string;
  version?: number;
  initial: Omit<SessionFormValue, "reason">;
}) {
  const router = useRouter();
  const [value, setValue] = useState<SessionFormValue>({ ...initial, reason: "" });
  const [result, setResult] = useState<{ error?: string; message?: string } | null>(null);
  const [pending, start] = useTransition();

  const set = (patch: Partial<SessionFormValue>) => setValue((v) => ({ ...v, ...patch }));
  const setBreak = (i: number, patch: Partial<{ start: string; end: string }>) =>
    set({ breaks: value.breaks.map((b, j) => (j === i ? { ...b, ...patch } : b)) });

  function save() {
    start(async () => {
      const r = await saveSessionAction(sessionId, employeeId, value, version);
      if (!r.ok) return setResult({ error: r.error });
      setResult({ message: r.message });
      if (!sessionId && r.data) router.push(`/admin/attendance/${r.data.id}`);
      else {
        set({ reason: "" });
        router.refresh();
      }
    });
  }

  function remove() {
    if (!value.reason.trim()) return setResult({ error: "削除する場合も理由を入力してください" });
    if (!confirm("この勤怠を削除しますか？（履歴には残ります）")) return;
    start(async () => {
      const r = await deleteSessionAction(sessionId!, value.reason, version);
      if (!r.ok) return setResult({ error: r.error });
      router.push(`/admin/attendance?employeeId=${employeeId}`);
    });
  }

  return (
    <div className="space-y-4">
      {result?.error && <Alert kind="error">{result.error}</Alert>}
      {result?.message && <Alert kind="success">{result.message}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="出勤">
          <Input type="datetime-local" value={value.clockIn} onChange={(e) => set({ clockIn: e.target.value })} />
        </Field>
        <Field label="退勤" hint="日付を跨ぐ場合は翌日の日付にしてください">
          <Input type="datetime-local" value={value.clockOut} onChange={(e) => set({ clockOut: e.target.value })} />
        </Field>
      </div>
      <div>
        <div className="mb-1 text-sm font-medium text-slate-700">休憩</div>
        <div className="space-y-2">
          {value.breaks.map((b, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Input type="datetime-local" aria-label={`休憩${i + 1} 開始`} value={b.start} onChange={(e) => setBreak(i, { start: e.target.value })} className="w-auto" />
              <span>〜</span>
              <Input type="datetime-local" aria-label={`休憩${i + 1} 終了`} value={b.end} onChange={(e) => setBreak(i, { end: e.target.value })} className="w-auto" />
              <Button type="button" variant="ghost" size="sm" onClick={() => set({ breaks: value.breaks.filter((_, j) => j !== i) })}>削除</Button>
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => set({ breaks: [...value.breaks, { start: value.clockIn, end: value.clockIn }] })}
          >
            ＋ 休憩を追加
          </Button>
        </div>
      </div>
      <Field label="修正理由（必須）" hint="修正前の値・修正者・理由は履歴に保存されます">
        <Textarea rows={2} value={value.reason} onChange={(e) => set({ reason: e.target.value })} placeholder="例：退勤の打刻忘れ（本人申告 23:00）" />
      </Field>
      <div className="flex flex-wrap justify-between gap-2">
        <Button onClick={save} disabled={pending}>{sessionId ? "修正を保存" : "勤怠を追加"}</Button>
        {sessionId && (
          <Button variant="danger" onClick={remove} disabled={pending}>この勤怠を削除</Button>
        )}
      </div>
    </div>
  );
}
