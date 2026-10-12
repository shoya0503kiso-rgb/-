"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui";
import { ackAnomalyAction } from "./actions";

export function AckButton({ sessionId, code }: { sessionId: string; code: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={pending}
      onClick={() => {
        const note = prompt("確認メモ（任意）", "");
        if (note === null) return;
        start(async () => {
          const r = await ackAnomalyAction(sessionId, code, note);
          if (!r.ok) alert(r.error);
          router.refresh();
        });
      }}
    >
      確認済みにする
    </Button>
  );
}
