"use server";
import { redirect } from "next/navigation";
import { createFirstAdmin } from "@/server/admins";
import { loginAdmin } from "@/server/auth";
import { UserError } from "@/server/errors";
import { assertNotLocked, recordFailure } from "@/server/rate-limit";
import { clientIp } from "@/server/auth";

export async function setupAction(_: string | null, form: FormData): Promise<string | null> {
  const ip = await clientIp();
  const now = new Date();
  const input = {
    setupToken: String(form.get("setupToken") ?? ""),
    loginId: String(form.get("loginId") ?? ""),
    name: String(form.get("name") ?? ""),
    password: String(form.get("password") ?? ""),
  };
  try {
    await assertNotLocked("setup", ip, now);
    await createFirstAdmin(input);
  } catch (e) {
    if (e instanceof UserError) {
      if (e.message === "セットアップキーが違います") await recordFailure("setup", ip, now);
      return e.message;
    }
    throw e;
  }
  await loginAdmin(input.loginId, input.password);
  redirect("/admin");
}
