"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { rotateDisplayKeyAction, rotateQrAction } from "./actions";

export function QrButtons() {
  const router = useRouter();
  async function run(fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>, q: string) {
    if (!confirm(q)) return;
    const res = await fn();
    alert(res.ok ? res.message : res.error);
    router.refresh();
  }
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" onClick={() => run(rotateQrAction, "今日のQRを作り直しますか？（QRの写真が出回ったときなど。今のQRは使えなくなります）")}>
        今日のQRを作り直す
      </Button>
      <Button size="sm" variant="secondary" onClick={() => run(rotateDisplayKeyAction, "タブレット表示用URLを作り直しますか？（今のURLは使えなくなります）")}>
        表示用URLを作り直す
      </Button>
    </div>
  );
}
