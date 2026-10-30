"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Card, Field, Input, Textarea } from "@/components/ui";
import { adjustPointsAction, issueLinkCodeAction, updateMemberAction } from "../actions";

type Msg = { kind: "success" | "error"; text: string } | null;

export function MemberPanels({ member }: { member: { id: string; nickname: string; memo: string; active: boolean } }) {
  const router = useRouter();
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<{ code: string; hours: number } | null>(null);

  async function run<T>(p: Promise<{ ok: true; message?: string; data?: T } | { ok: false; error: string }>) {
    setBusy(true);
    const res = await p;
    setBusy(false);
    setMsg(res.ok ? { kind: "success", text: res.message ?? "完了しました" } : { kind: "error", text: res.error });
    if (res.ok) router.refresh();
    return res;
  }

  return (
    <div className="space-y-4">
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="ポイントの付与・減算">
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const sign = f.get("sign") === "minus" ? -1 : 1;
              const amount = sign * Number(f.get("amount"));
              const form = e.currentTarget;
              const res = await run(adjustPointsAction(member.id, amount, String(f.get("note") ?? "")));
              if (res.ok) form.reset();
            }}
          >
            <div className="flex gap-2">
              <select name="sign" className="rounded-lg border border-slate-300 px-2">
                <option value="plus">＋ 付与</option>
                <option value="minus">− 減算</option>
              </select>
              <Input name="amount" type="number" min={1} required placeholder="ポイント" inputMode="numeric" />
            </div>
            <Field label="理由（履歴に残ります）">
              <Input name="note" required placeholder="例：誕生日ボーナス" />
            </Field>
            <Button disabled={busy} className="w-full">
              実行
            </Button>
          </form>
        </Card>

        <Card title="会員情報">
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              await run(updateMemberAction(member.id, { nickname: String(f.get("nickname")), memo: String(f.get("memo")), active: f.get("active") === "on" }));
            }}
          >
            <Field label="ニックネーム">
              <Input name="nickname" defaultValue={member.nickname} required maxLength={20} />
            </Field>
            <Field label="メモ（スタッフだけが見られます）">
              <Textarea name="memo" defaultValue={member.memo} rows={2} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={member.active} /> 利用中（外すと停止・ランキングから外れます）
            </label>
            <Button disabled={busy} variant="secondary" className="w-full">
              保存
            </Button>
          </form>
        </Card>
      </div>

      <Card title="引き継ぎコード（機種変更・別の端末で使うとき）">
        <p className="mb-3 text-sm text-slate-600">発行したコードをお客さんの登録画面「引き継ぎコードをお持ちの方」に入れてもらうと、この会員でログインできます（24時間有効・1回限り）。</p>
        {code ? (
          <div className="rounded-xl bg-rose-50 p-4 text-center">
            <div className="font-mono text-3xl font-bold tracking-widest text-rose-700">{code.code}</div>
            <div className="mt-1 text-xs text-slate-500">{code.hours}時間有効</div>
          </div>
        ) : (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={async () => {
              const res = await run(issueLinkCodeAction(member.id));
              if (res.ok && res.data) setCode(res.data);
            }}
          >
            コードを発行
          </Button>
        )}
      </Card>
    </div>
  );
}
