"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { redeemAction } from "../actions";

export function RedeemButton({ id, name, cost, disabled }: { id: string; name: string; cost: number; disabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function onClick() {
    if (!confirm(`「${name}」と ${cost.toLocaleString()}pt を交換しますか？`)) return;
    setBusy(true);
    const res = await redeemAction(id);
    setBusy(false);
    alert(res.ok ? res.message : res.error);
    router.refresh();
  }
  return (
    <button onClick={onClick} disabled={disabled || busy} className="shrink-0 rounded-xl bg-rose-500 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-300">
      {disabled ? "たりない" : "交換"}
    </button>
  );
}
