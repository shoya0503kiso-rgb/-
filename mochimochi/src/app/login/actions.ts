"use server";
import { redirect } from "next/navigation";
import { loginAdmin, logoutAdmin, safeNextPath } from "@/server/auth";
import { UserError } from "@/server/errors";

export async function loginAction(_: string | null, form: FormData): Promise<string | null> {
  let mustChange = false;
  try {
    ({ mustChange } = await loginAdmin(String(form.get("loginId") ?? ""), String(form.get("password") ?? "")));
  } catch (e) {
    if (e instanceof UserError) return e.message;
    throw e;
  }
  // 初期・仮パスワードのままなら、まずパスワード変更へ
  redirect(mustChange ? "/admin/staff?first=1" : safeNextPath(String(form.get("next") ?? "")));
}

export async function logoutAction() {
  await logoutAdmin();
  redirect("/login");
}
