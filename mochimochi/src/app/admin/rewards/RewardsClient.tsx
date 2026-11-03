"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Card, Input } from "@/components/ui";
import { deleteRewardAction, handleRedemptionAction, saveRewardAction } from "./actions";

export function RedemptionButtons({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function go(action: "done" | "cancel") {
    if (action === "cancel" && !confirm("取り消してポイントを戻しますか？")) return;
    setBusy(true);
    const res = await handleRedemptionAction(id, action);
    setBusy(false);
    if (!res.ok) alert(res.error);
    router.refresh();
  }
  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={busy} onClick={() => go("done")}>
        提供済み
      </Button>
      <Button size="sm" variant="secondary" disabled={busy} onClick={() => go("cancel")}>
        取消
      </Button>
    </div>
  );
}

type Reward = { id?: string; name: string; cost: number; description: string; active: boolean; sortOrder: number };

export function RewardEditor({ rewards }: { rewards: Reward[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function save(r: Reward, form?: HTMLFormElement) {
    const res = await saveRewardAction(r);
    setMsg(res.ok ? { kind: "success", text: res.message! } : { kind: "error", text: res.error });
    if (res.ok) {
      form?.reset();
      router.refresh();
    }
  }

  const row = (r: Reward | null) => (
    <form
      key={r?.id ?? "new"}
      className="grid grid-cols-[1fr_90px] gap-2 border-b border-slate-100 py-3 sm:grid-cols-[1fr_100px_1fr_60px_auto_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void save(
          { id: r?.id, name: String(f.get("name")), cost: Number(f.get("cost")), description: String(f.get("description")), active: f.get("active") === "on", sortOrder: Number(f.get("sortOrder")) },
          r ? undefined : e.currentTarget,
        );
      }}
    >
      <Input name="name" defaultValue={r?.name} placeholder="交換するもの" required />
      <Input name="cost" type="number" min={1} defaultValue={r?.cost} placeholder="pt" required />
      <Input name="description" defaultValue={r?.description} placeholder="説明（任意）" className="col-span-2 sm:col-span-1" />
      <Input name="sortOrder" type="number" defaultValue={r?.sortOrder ?? 0} title="並び順" />
      <label className="flex items-center gap-1 text-sm">
        <input type="checkbox" name="active" defaultChecked={r?.active ?? true} /> 公開
      </label>
      <div className="flex gap-2">
        <Button size="sm">{r ? "保存" : "追加"}</Button>
        {r?.id && (
          <Button
            size="sm"
            type="button"
            variant="secondary"
            onClick={async () => {
              if (!confirm("削除しますか？")) return;
              await deleteRewardAction(r.id!);
              router.refresh();
            }}
          >
            削除
          </Button>
        )}
      </div>
    </form>
  );

  return (
    <Card title="交換メニュー（仮）">
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <div className="hidden grid-cols-[1fr_100px_1fr_60px_auto_auto] gap-2 text-xs text-slate-500 sm:grid">
        <span>名前</span>
        <span>必要pt</span>
        <span>説明</span>
        <span>並び順</span>
      </div>
      {rewards.map((r) => row(r))}
      {row(null)}
    </Card>
  );
}
