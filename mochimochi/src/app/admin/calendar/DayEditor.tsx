"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { deleteEventAction, deletePointDayAction, saveEventAction, savePointDayAction } from "./actions";

type Ev = { id: string; title: string; startTime: string; description: string };
type PD = { mode: string; value: number; label: string };
type Res = { ok: true; message?: string } | { ok: false; error: string };

export function DayEditor({ date, dateLabel, events, pointDay }: { date: string; dateLabel: string; events: Ev[]; pointDay: PD | null }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [editing, setEditing] = useState<Ev | null>(null);
  const [mode, setMode] = useState(pointDay?.mode ?? "multiply");

  async function run(p: Promise<Res>) {
    const res = await p;
    setMsg(res.ok ? { kind: "success", text: res.message ?? "完了" } : { kind: "error", text: res.error });
    if (res.ok) router.refresh();
    return res.ok;
  }

  return (
    <div className="space-y-4">
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <Card title={`${dateLabel} のポイント倍率`}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run(savePointDayAction({ date, mode: String(f.get("mode")), value: Number(f.get("value")), label: String(f.get("label")) }));
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <Field label="種類">
              <Select name="mode" value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="multiply">◯倍デー</option>
                <option value="fixed">来店◯ptデー</option>
              </Select>
            </Field>
            <Field label={mode === "fixed" ? "来店ポイント" : "倍率"}>
              <Input name="value" type="number" step={mode === "fixed" ? 1 : 0.5} min={mode === "fixed" ? 1 : 0.5} defaultValue={pointDay?.value ?? (mode === "fixed" ? 10 : 2)} required />
            </Field>
          </div>
          <Field label="表示名（任意）" hint="空なら「ポイント2倍デー」などと自動表示">
            <Input name="label" defaultValue={pointDay?.label ?? ""} maxLength={30} />
          </Field>
          <p className="text-xs text-slate-500">
            {mode === "fixed" ? "その日の来店ポイントがこの値になります（ゲームは通常どおり）" : "その日の来店ポイントとデイリーゲームのポイントが◯倍になります"}
          </p>
          <div className="flex gap-2">
            <Button className="flex-1">設定</Button>
            {pointDay && (
              <Button type="button" variant="secondary" onClick={() => run(deletePointDayAction(date))}>
                解除
              </Button>
            )}
          </div>
        </form>
      </Card>

      <Card title={`${dateLabel} のイベント`}>
        {events.length > 0 && (
          <ul className="mb-4 divide-y divide-slate-100">
            {events.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-2 py-2">
                <div>
                  <div className="font-bold">
                    {e.title} {e.startTime && <span className="text-sm font-normal text-slate-500">{e.startTime}〜</span>}
                  </div>
                  {e.description && <div className="text-xs whitespace-pre-wrap text-slate-600">{e.description}</div>}
                </div>
                <div className="flex shrink-0 gap-2 text-xs">
                  <button onClick={() => setEditing(e)} className="text-rose-700">
                    編集
                  </button>
                  <button onClick={() => confirm("削除しますか？") && run(deleteEventAction(e.id))} className="text-slate-400 hover:text-red-600">
                    削除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <form
          key={editing?.id ?? "new"}
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const f = new FormData(form);
            const ok = await run(
              saveEventAction({ id: editing?.id, date, title: String(f.get("title")), startTime: String(f.get("startTime")), description: String(f.get("description")) }),
            );
            if (ok) {
              setEditing(null);
              form.reset();
            }
          }}
        >
          <div className="text-sm font-bold text-slate-700">{editing ? "イベントを編集" : "イベントを追加"}</div>
          <Field label="イベント名">
            <Input name="title" defaultValue={editing?.title} required maxLength={60} placeholder="例：ダーツ大会" />
          </Field>
          <Field label="開始時刻（任意）">
            <Input name="startTime" type="time" defaultValue={editing?.startTime} />
          </Field>
          <Field label="説明（任意）">
            <Textarea name="description" rows={2} defaultValue={editing?.description} maxLength={500} />
          </Field>
          <div className="flex gap-2">
            <Button className="flex-1">{editing ? "更新" : "追加"}</Button>
            {editing && (
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                やめる
              </Button>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}
