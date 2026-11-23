"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import { markPassUsedAction } from "./actions";

export function PassUseButton({ id, used }: { id: string; used: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant={used ? "ghost" : "primary"}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await markPassUsedAction(id, !used);
        setBusy(false);
        if (!res.ok) alert(res.error);
        router.refresh();
      }}
    >
      {used ? "未使用に戻す" : "使用済みにする"}
    </Button>
  );
}
