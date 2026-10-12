"use client";
import { useActionState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { setupAction } from "./actions";

export function SetupForm() {
  const [error, action, pending] = useActionState(setupAction, null);
  return (
    <form action={action} className="space-y-4">
      {error && <Alert kind="error">{error}</Alert>}
      <Field label="セットアップキー">
        <Input name="setupToken" type="password" required autoComplete="off" />
      </Field>
      <Field label="名前"><Input name="name" defaultValue="店長" required /></Field>
      <Field label="ログインID" hint="半角英数字">
        <Input name="loginId" autoComplete="username" required />
      </Field>
      <Field label="パスワード" hint="8文字以上">
        <Input name="password" type="password" autoComplete="new-password" required />
      </Field>
      <Button type="submit" disabled={pending} className="w-full">{pending ? "作成中…" : "管理者を作成してログイン"}</Button>
    </form>
  );
}
