"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MemberPicker } from "@/components/admin/MemberPicker";
import { Alert, Card, Empty } from "@/components/ui";
import { submarineAction } from "./actions";

type Row = { id: string; nickname: string; count: number; rank: number };

export function SubmarineBoard({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function change(id: string, nickname: string, delta: 1 | -1) {
    setBusy(id);
    const res = await submarineAction(id, delta);
    setBusy(null);
    setMsg(res.ok ? { kind: "success", text: `${nickname} さん：今月 ${res.data!.count}杯` } : { kind: "error", text: res.error });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <Card title="🍺 会員を選んで ＋1">
        <MemberPicker placeholder="ニックネームで検索して＋1" onPick={(m) => change(m.id, m.nickname, 1)} />
      </Card>
      <Card title="今月のランキング">
        {rows.length === 0 ? (
          <Empty>今月はまだ記録がありません</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2">
                <span className="w-8 text-center font-bold text-slate-500">{r.rank}</span>
                <span className="min-w-0 flex-1 truncate font-bold">{r.nickname}</span>
                <span className="w-14 text-right text-lg font-bold">{r.count}杯</span>
                <button
                  disabled={busy === r.id}
                  onClick={() => change(r.id, r.nickname, -1)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 disabled:opacity-50"
                >
                  −1
                </button>
                <button disabled={busy === r.id} onClick={() => change(r.id, r.nickname, 1)} className="rounded-lg bg-rose-500 px-4 py-2 font-bold text-white disabled:opacity-50">
                  ＋1
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
