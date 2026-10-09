"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth";
import { runAction } from "@/server/errors";
import { issueLinkCode, unlinkLine } from "@/server/line/link";

export async function issueLinkCodeAction(employeeId: string) {
  await requireAdmin();
  return runAction(async () => {
    const c = await issueLinkCode(employeeId);
    return { code: c.code, expiresAt: c.expiresAt };
  });
}

export async function unlinkLineAction(employeeId: string) {
  await requireAdmin();
  const r = await runAction(() => unlinkLine(employeeId));
  revalidatePath(`/admin/employees/${employeeId}`);
  return r;
}
