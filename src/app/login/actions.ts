"use server";
import { redirect } from "next/navigation";
import { loginAdmin, logoutAdmin, logoutAdminEverywhere, safeNextPath } from "@/server/auth";
import { UserError } from "@/server/errors";

export async function loginAction(_: string | null, form: FormData): Promise<string | null> {
  try {
    await loginAdmin(String(form.get("loginId") ?? ""), String(form.get("password") ?? ""));
  } catch (e) {
    if (e instanceof UserError) return e.message;
    throw e;
  }
  redirect(safeNextPath(String(form.get("next") ?? "")));
}

export async function logoutAction() {
  await logoutAdmin();
  redirect("/login");
}

export async function logoutEverywhereAction() {
  await logoutAdminEverywhere();
  redirect("/login");
}
