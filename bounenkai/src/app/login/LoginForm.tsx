"use client";
import { useActionState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { loginAction } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [error, action, pending] = useActionState(loginAction, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      {error && <Alert kind="error">{error}</Alert>}
      <Field label="ログインID">
        <Input name="loginId" autoComplete="username" required autoFocus />
      </Field>
      <Field label="パスワード">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "ログイン中…" : "ログイン"}
      </Button>
    </form>
  );
}
