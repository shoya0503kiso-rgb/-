"use client";
import { Alert, Button } from "@/components/ui";

export default function AdminError({ reset }: { reset: () => void }) {
  return (
    <div className="space-y-3">
      <Alert kind="error">画面の表示中にエラーが発生しました。通信状況を確認して再読み込みしてください。</Alert>
      <Button onClick={() => reset()}>再読み込み</Button>
    </div>
  );
}
