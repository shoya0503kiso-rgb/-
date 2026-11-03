"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MemberPicker, type PickedMember } from "@/components/admin/MemberPicker";
import { Alert, Button, Card, Field, Input, cx } from "@/components/ui";
import { createMatchAction, deleteMatchAction } from "./actions";

type Row = PickedMember & { place: number };
type Table = Record<"darts" | "poker", { place: number; points: number }[]>;

export function ResultForm({ today, table }: { today: string; table: Table }) {
  const router = useRouter();
  const [game, setGame] = useState<"darts" | "poker">("darts");
  const [date, setDate] = useState(today);
  const [title, setTitle] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const pts = new Map(table[game].map((r) => [r.place, r.points]));

  async function submit() {
    setBusy(true);
    const res = await createMatchAction({ game, date, title, entries: rows.map((r) => ({ memberId: r.id, place: r.place })) });
    setBusy(false);
    setMsg(res.ok ? { kind: "success", text: res.message! } : { kind: "error", text: res.error });
    if (res.ok) {
      setRows([]);
      setTitle("");
      router.refresh();
    }
  }

  return (
    <Card title="結果を登録">
      <div className="space-y-4">
        {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
        <div className="flex gap-2">
          {(["darts", "poker"] as const).map((g) => (
            <button key={g} type="button" onClick={() => setGame(g)} className={cx("flex-1 rounded-lg py-2 font-bold", game === g ? "bg-rose-500 text-white" : "bg-slate-100 text-slate-600")}>
              {g === "darts" ? "🎯 ダーツ" : "🃏 ポーカー"}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="日付">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="大会名・メモ（任意）">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例：金曜トーナメント" maxLength={50} />
          </Field>
        </div>
        <div>
          <div className="mb-1 text-sm font-medium text-slate-700">参加者と順位（上から順に追加すると順位が自動で入ります）</div>
          <ul className="mb-2 space-y-2">
            {rows.map((r, i) => (
              <li key={r.id} className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  value={r.place}
                  onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, place: Number(e.target.value) } : x)))}
                  className="w-16 rounded-lg border border-slate-300 px-2 py-1.5 text-center"
                  aria-label="順位"
                />
                <span className="text-sm">位</span>
                <span className="flex-1 truncate font-bold">{r.nickname}</span>
                <span className="text-sm text-rose-600">+{pts.get(r.place) ?? 0}</span>
                <button type="button" onClick={() => setRows(rows.filter((_, k) => k !== i))} className="px-2 text-slate-400 hover:text-red-600" aria-label="削除">
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <MemberPicker exclude={rows.map((r) => r.id)} placeholder="参加者を追加（ニックネームで検索）" onPick={(m) => setRows([...rows, { ...m, place: rows.length + 1 }])} />
        </div>
        <Button onClick={submit} disabled={busy || rows.length === 0} className="w-full">
          登録してポイント付与
        </Button>
      </div>
    </Card>
  );
}

export function DeleteMatchButton({ id }: { id: string }) {
  const router = useRouter();
  return (
    <button
      className="text-xs text-slate-400 hover:text-red-600"
      onClick={async () => {
        if (!confirm("この結果を取り消しますか？付与したポイントも戻します")) return;
        const res = await deleteMatchAction(id);
        if (!res.ok) alert(res.error);
        router.refresh();
      }}
    >
      取り消し
    </button>
  );
}
