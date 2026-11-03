"use server";

import { redirect } from "next/navigation";
import { safeNextPath } from "@/server/auth";
import { runAction } from "@/server/errors";
import { loginWithLine, loginWithLinkCode, signupGuest } from "@/server/member-auth";

export async function signupAction(nickname: string, next: string) {
  const res = await runAction(() => signupGuest(String(nickname ?? "")));
  if (!res.ok) return res;
  redirect(safeNextPath(String(next ?? ""), "/me"));
}

export async function linkCodeAction(code: string, next: string) {
  const res = await runAction(() => loginWithLinkCode(String(code ?? "")));
  if (!res.ok) return res;
  redirect(safeNextPath(String(next ?? ""), "/me"));
}

export async function lineLoginAction(idToken: string) {
  return runAction(async () => {
    await loginWithLine(String(idToken ?? ""));
  });
}
