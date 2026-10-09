"use server";
import { redirect } from "next/navigation";
import { loginAdmin, logoutAdmin } from "@/server/auth";
import { UserError } from "@/server/errors";

export async function loginAction(_: string | null, form: FormData): Promise<string | null> {
  try {
    await loginAdmin(String(form.get("loginId") ?? ""), String(form.get("password") ?? ""));
  } catch (e) {
    if (e instanceof UserError) return e.message;
    throw e;
  }
  const next = String(form.get("next") ?? "");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/admin");
}

export async function logoutAction() {
  await logoutAdmin();
  redirect("/login");
}
