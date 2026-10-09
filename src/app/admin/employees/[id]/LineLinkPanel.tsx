"use client";
import { useState, useTransition } from "react";
import { Alert, Button } from "@/components/ui";
import { issueLinkCodeAction, unlinkLineAction } from "./actions";

export function LineLinkPanel({ employeeId, linked }: { employeeId: string; linked: { displayName: string; linkedAt: Date } | null }) {
  const [code, setCode] = useState<{ code: string; expiresAt: Date } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-3">
      {linked ? (
        <p className="text-sm">
          連携済み：<b>{linked.displayName || "（表示名なし）"}</b>（{new Date(linked.linkedAt).toLocaleDateString("ja-JP")}）
        </p>
      ) : (
        <p className="text-sm text-slate-600">未連携です。連携コードを発行し、本人に公式アカウント「シフト管理くん」のトークへ送ってもらってください。</p>
      )}
      {error && <Alert kind="error">{error}</Alert>}
      {code && (
        <div className="rounded-xl border border-teal-300 bg-teal-50 p-4 text-center">
          <div className="text-sm text-teal-900">連携コード（24時間有効）</div>
          <div className="my-1 text-4xl font-bold tracking-[0.3em] tabular-nums">{code.code}</div>
          <div className="text-xs text-slate-600">このコードをLINEのトークに送信すると連携が完了します</div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await issueLinkCodeAction(employeeId);
              if (r.ok && r.data) {
                setCode(r.data);
                setError(null);
              } else if (!r.ok) setError(r.error);
            })
          }
        >
          {linked ? "連携し直す（コード発行）" : "連携コードを発行"}
        </Button>
        {linked && (
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => {
              if (confirm("LINE連携を解除しますか？")) start(async () => void (await unlinkLineAction(employeeId)));
            }}
          >
            連携を解除
          </Button>
        )}
      </div>
    </div>
  );
}
