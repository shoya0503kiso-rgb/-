"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, Button, Input } from "@/components/ui";
import type { ActionResult } from "@/server/errors";
import { closeCollectionAction, extendDeadlineAction, openCollectionAction, remindAction } from "./actions";

export function PeriodActions({ ym, status, accepting, deadlineDate }: { ym: string; status: string; accepting: boolean; deadlineDate: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ error?: string; message?: string } | null>(null);
  const [date, setDate] = useState(deadlineDate);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult<string>>, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { message: r.data } : { error: r.error });
      router.refresh();
    });
  };
  const beforeDraft = ["PREPARING", "COLLECTING", "CLOSED"].includes(status);

  return (
    <div className="space-y-3">
      {msg?.error && <Alert kind="error">{msg.error}</Alert>}
      {msg?.message && <Alert kind="success">{msg.message}</Alert>}
      <div className="flex flex-wrap gap-2">
        {status === "PREPARING" && (
          <Button disabled={pending} onClick={() => run(() => openCollectionAction(ym), "受付を開始し、全員にLINEで提出依頼を送りますか？")}>受付開始（提出依頼を送信）</Button>
        )}
        {accepting && (
          <>
            <Button variant="secondary" disabled={pending} onClick={() => run(() => remindAction(ym), "未提出者にLINEでリマインドを送りますか？")}>未提出者にリマインド</Button>
            <Button variant="secondary" disabled={pending} onClick={() => run(() => closeCollectionAction(ym), "受付を終了しますか？（スタッフは変更できなくなります）")}>受付を終了</Button>
          </>
        )}
      </div>
      {beforeDraft && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>締切日</span>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-auto" />
          <span>23:59</span>
          <Button size="sm" variant="secondary" disabled={pending || !date} onClick={() => run(() => extendDeadlineAction(ym, date))}>締切を変更</Button>
        </div>
      )}
    </div>
  );
}
