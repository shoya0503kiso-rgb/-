"use server";
import { revalidatePath } from "next/cache";
import { changePassword, createAdmin, resetAdminPassword, setAdminActive } from "@/server/admins";
import { reissueAdminSession, requireAdmin } from "@/server/auth";
import { runAction } from "@/server/errors";

export async function changePasswordAction(current: string, next: string) {
  const admin = await requireAdmin({ allowMustChange: true });
  const r = await runAction(async () => {
    await changePassword(admin.adminId, current, next);
    await reissueAdminSession(admin.adminId);
  }, "パスワードを変更しました（他の端末のログインは解除されました）");
  revalidatePath("/admin", "layout");
  return r;
}

export async function createAdminAction(input: { loginId: string; name: string; password: string }) {
  await requireAdmin();
  const r = await runAction(async () => {
    await createAdmin(input);
  }, "スタッフを追加しました。初回ログイン後にパスワードを変更してもらってください");
  revalidatePath("/admin/staff");
  return r;
}

export async function setAdminActiveAction(id: string, active: boolean) {
  const admin = await requireAdmin();
  const r = await runAction(() => setAdminActive(admin.adminId, id, active), active ? "再開しました" : "停止しました");
  revalidatePath("/admin/staff");
  return r;
}

export async function resetAdminPasswordAction(id: string, temp: string) {
  const admin = await requireAdmin();
  return runAction(() => resetAdminPassword(admin.adminId, id, temp), "仮パスワードを再発行しました。本人に伝えてください（初回ログイン時に変更されます）");
}
