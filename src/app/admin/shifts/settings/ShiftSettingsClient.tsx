"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, Badge, Button, Input, Select, TableWrap, td, th } from "@/components/ui";
import { WEEKDAY_JA, formatDateJa, formatHmRange } from "@/lib/time";
import type { ActionResult } from "@/server/errors";
import { saveStaffingRulesAction, savePatternAction, setOverrideAction } from "../actions";

interface Pattern {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  sortOrder: number;
  active: boolean;
}

function useAction() {
  const router = useRouter();
  const [msg, setMsg] = useState<{ error?: string; message?: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult<unknown>>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { message: r.message ?? "保存しました" } : { error: r.error });
      if (r.ok) router.refresh();
    });
  const view = msg && <Alert kind={msg.error ? "error" : "success"}>{msg.error ?? msg.message}</Alert>;
  return { run, pending, view };
}

export function PatternEditor({ patterns }: { patterns: Pattern[] }) {
  const { run, pending, view } = useAction();
  const [draft, setDraft] = useState({ name: "", startTime: "15:00", endTime: "23:00" });
  return (
    <div className="space-y-3">
      {view}
      <ul className="divide-y divide-slate-100">
        {patterns.map((p) => (
          <PatternRow key={p.id} p={p} onSave={(v) => run(() => savePatternAction(p.id, v))} pending={pending} />
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
        <Input placeholder="枠の名前（例：早番）" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="w-40" />
        <Input type="time" value={draft.startTime} onChange={(e) => setDraft({ ...draft, startTime: e.target.value })} className="w-32" aria-label="開始" />
        <span>〜</span>
        <Input type="time" value={draft.endTime} onChange={(e) => setDraft({ ...draft, endTime: e.target.value })} className="w-32" aria-label="終了" />
        <Button
          disabled={pending}
          onClick={() => run(async () => {
            const r = await savePatternAction(null, { ...draft, sortOrder: patterns.length });
            if (r.ok) setDraft({ ...draft, name: "" });
            return r;
          })}
        >
          ＋ 枠を追加
        </Button>
      </div>
      <p className="text-xs text-slate-500">終了が開始より前の時刻なら翌日終了（例 20:00〜05:00）。使わなくなった枠は「停止」にしてください（過去のシフトは残ります）。</p>
    </div>
  );
}

function PatternRow({ p, onSave, pending }: { p: Pattern; onSave: (v: Omit<Pattern, "id">) => void; pending: boolean }) {
  const [v, setV] = useState(p);
  const changed = v.name !== p.name || v.startTime !== p.startTime || v.endTime !== p.endTime;
  return (
    <li className="flex flex-wrap items-center gap-2 py-2">
      <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} className="w-32" aria-label="枠の名前" />
      <Input type="time" value={v.startTime} onChange={(e) => setV({ ...v, startTime: e.target.value })} className="w-32" aria-label="開始" />
      <span>〜</span>
      <Input type="time" value={v.endTime} onChange={(e) => setV({ ...v, endTime: e.target.value })} className="w-32" aria-label="終了" />
      <span className="text-sm text-slate-500">{formatHmRange(v.startTime, v.endTime)}</span>
      {!p.active && <Badge>停止中</Badge>}
      {changed && <Button size="sm" disabled={pending} onClick={() => onSave(v)}>保存</Button>}
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => onSave({ ...p, active: !p.active })}>{p.active ? "停止" : "再開"}</Button>
    </li>
  );
}

export function StaffingGrid({ patterns, initial }: { patterns: Pattern[]; initial: Record<number, Record<string, number>> }) {
  const { run, pending, view } = useAction();
  const [counts, setCounts] = useState(initial);
  return (
    <div className="space-y-3">
      {view}
      <TableWrap>
        <table>
          <thead>
            <tr>
              <th className={th}>枠</th>
              {WEEKDAY_JA.map((w, i) => (
                <th key={i} className={`${th} text-center ${i === 0 || i === 6 ? "text-red-700" : ""}`}>{w}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {patterns.map((p) => (
              <tr key={p.id}>
                <td className={td}>{p.name}<div className="text-xs text-slate-500">{formatHmRange(p.startTime, p.endTime)}</div></td>
                {WEEKDAY_JA.map((_, w) => (
                  <td key={w} className={td}>
                    <Input
                      type="number"
                      min={0}
                      max={50}
                      aria-label={`${p.name} ${WEEKDAY_JA[w]}`}
                      value={counts[w]?.[p.id] ?? 0}
                      onChange={(e) => setCounts({ ...counts, [w]: { ...counts[w], [p.id]: Number(e.target.value) } })}
                      className="w-16 text-center"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <Button disabled={pending} onClick={() => run(() => saveStaffingRulesAction(counts))}>必要人数を保存</Button>
    </div>
  );
}

export function OverrideEditor({ patterns, overrides }: { patterns: Pattern[]; overrides: { date: string; patternId: string; patternName: string; count: number }[] }) {
  const { run, pending, view } = useAction();
  const [date, setDate] = useState("");
  const [patternId, setPatternId] = useState(patterns[0]?.id ?? "");
  const [count, setCount] = useState(2);
  return (
    <div className="space-y-3">
      {view}
      <div className="flex flex-wrap items-end gap-2">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-auto" aria-label="日付" />
        <Select value={patternId} onChange={(e) => setPatternId(e.target.value)} className="w-auto" aria-label="枠">
          {patterns.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <Input type="number" min={0} max={50} value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-20" aria-label="人数" />
        <span className="text-sm">人</span>
        <Button variant="secondary" disabled={pending || !date || !patternId} onClick={() => run(() => setOverrideAction(date, patternId, count))}>設定</Button>
      </div>
      <p className="text-xs text-slate-500">イベント日・大会の日などに使います。0人にするとその日その枠は配置しません。</p>
      {overrides.length > 0 && (
        <ul className="divide-y divide-slate-100 text-sm">
          {overrides.map((o) => (
            <li key={`${o.date}|${o.patternId}`} className="flex items-center justify-between py-1.5">
              <span>{formatDateJa(o.date)} {o.patternName}：<b>{o.count}人</b></span>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setOverrideAction(o.date, o.patternId, null))}>解除</Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
