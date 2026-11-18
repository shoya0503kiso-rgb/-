"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MAX_PEOPLE, MIN_PEOPLE } from "@/lib/booking";
import { Button } from "@/components/ui";
import type { ActionResult } from "@/server/errors";
import { cancelAction, changePeopleAction, setConfirmedAction, setNoteAction } from "./actions";

export function ReservationControls({ id, confirmed, people, note }: { id: string; confirmed: boolean; people: number; note: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [n, setN] = useState(people);
  const [memo, setMemo] = useState(note);
  const [editMemo, setEditMemo] = useState(false);

  const run = (fn: () => Promise<ActionResult<unknown>>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? (r.message ? { ok: true, text: r.message } : null) : { ok: false, text: r.error });
      router.refresh();
    });

  return (
    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
          <input type="checkbox" className="size-4 accent-emerald-600" checked={confirmed} disabled={pending} onChange={(e) => run(() => setConfirmedAction(id, e.target.checked))} />
          前日確認済み
        </label>
        <span className="flex items-center gap-1 text-sm">
          人数
          <input
            type="number"
            min={MIN_PEOPLE}
            max={MAX_PEOPLE}
            value={n}
            onChange={(e) => setN(Number(e.target.value))}
            className="w-16 rounded border border-slate-300 px-2 py-1"
          />
          名
          <Button size="sm" variant="secondary" disabled={pending || n === people} onClick={() => run(() => changePeopleAction(id, n))}>
            変更
          </Button>
        </span>
        <Button size="sm" variant="ghost" onClick={() => setEditMemo(!editMemo)}>
          メモ
        </Button>
        <Button
          size="sm"
          variant="danger"
          className="ml-auto"
          disabled={pending}
          onClick={() => {
            if (confirm("この予約をキャンセルにしますか？（空いた枠はすぐ予約ページで選べるようになります）")) run(() => cancelAction(id));
          }}
        >
          キャンセルにする
        </Button>
      </div>
      {editMemo && (
        <div className="flex gap-2">
          <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm" />
          <Button size="sm" disabled={pending} onClick={() => run(() => setNoteAction(id, memo))}>
            保存
          </Button>
        </div>
      )}
      {msg && <p className={msg.ok ? "text-sm text-emerald-700" : "text-sm text-red-700"}>{msg.text}</p>}
    </div>
  );
}
