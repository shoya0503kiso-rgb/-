"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, Button } from "@/components/ui";
import { dispatchAction, runDailyAction } from "./actions";

export function LineActions() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: typeof dispatchAction) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? (r.data ?? "") : r.error);
      router.refresh();
    });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={pending} onClick={() => run(dispatchAction)}>未送信の通知を送信</Button>
        <Button variant="secondary" disabled={pending} onClick={() => run(runDailyAction)}>毎日の自動処理を今すぐ実行</Button>
      </div>
      {msg && <Alert kind="info"><pre className="font-sans whitespace-pre-wrap">{msg}</pre></Alert>}
    </div>
  );
}
