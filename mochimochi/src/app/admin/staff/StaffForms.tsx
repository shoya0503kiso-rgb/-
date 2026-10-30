"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import type { ActionResult } from "@/server/errors";
import { changePasswordAction, createAdminAction, resetAdminPasswordAction, setAdminActiveAction } from "./actions";

function useRun() {
  const router = useRouter();
  const [msg, setMsg] = useState<{ error?: string; message?: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult<unknown>>, onOk?: () => void) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { message: r.message } : { error: r.error });
      if (r.ok) {
        onOk?.();
        router.refresh();
      }
    });
  return { run, pending, view: msg && <Alert kind={msg.error ? "error" : "success"}>{msg.error ?? msg.message}</Alert> };
}

export function ChangePasswordForm() {
  const { run, pending, view } = useRun();
  const [v, setV] = useState({ current: "", next: "", confirm: "" });
  return (
    <form
      className="max-w-sm space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (v.next !== v.confirm) return run(async () => ({ ok: false, error: "新しいパスワードが一致しません" }));
        run(() => changePasswordAction(v.current, v.next), () => setV({ current: "", next: "", confirm: "" }));
      }}
    >
      {view}
      <Field label="現在のパスワード">
        <Input type="password" autoComplete="current-password" value={v.current} onChange={(e) => setV({ ...v, current: e.target.value })} required />
      </Field>
      <Field label="新しいパスワード" hint="8文字以上">
        <Input type="password" autoComplete="new-password" value={v.next} onChange={(e) => setV({ ...v, next: e.target.value })} required />
      </Field>
      <Field label="新しいパスワード（確認）">
        <Input type="password" autoComplete="new-password" value={v.confirm} onChange={(e) => setV({ ...v, confirm: e.target.value })} required />
      </Field>
      <Button type="submit" disabled={pending}>変更する</Button>
    </form>
  );
}

export function NewAdminForm() {
  const { run, pending, view } = useRun();
  const [v, setV] = useState({ loginId: "", name: "", password: "" });
  return (
    <form
      className="max-w-sm space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => createAdminAction(v), () => setV({ loginId: "", name: "", password: "" }));
      }}
    >
      {view}
      <Field label="名前"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required /></Field>
      <Field label="ログインID" hint="半角英数字"><Input value={v.loginId} onChange={(e) => setV({ ...v, loginId: e.target.value })} required /></Field>
      <Field label="仮パスワード" hint="8文字以上。本人に伝え、初回に変更してもらいます">
        <Input type="password" autoComplete="new-password" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} required />
      </Field>
      <Button type="submit" variant="secondary" disabled={pending}>追加</Button>
    </form>
  );
}

export function AdminActiveButton({ id, active }: { id: string; active: boolean }) {
  const { run, pending, view } = useRun();
  return (
    <span className="flex items-center gap-2">
      {view}
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => {
          const temp = prompt("仮パスワード（8文字以上）を入力してください。本人に伝え、次回ログイン時に変更してもらいます。");
          if (temp) run(() => resetAdminPasswordAction(id, temp));
        }}
      >
        仮パスワード再発行
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => {
          if (active && !confirm("このスタッフを停止しますか？（ログインできなくなります）")) return;
          run(() => setAdminActiveAction(id, !active));
        }}
      >
        {active ? "停止" : "再開"}
      </Button>
    </span>
  );
}
