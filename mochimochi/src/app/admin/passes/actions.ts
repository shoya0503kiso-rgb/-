"use server";

import { revalidatePath } from "next/cache";
import { adminAction } from "@/server/admin-action";
import { markPassUsed } from "@/server/casino";

export async function markPassUsedAction(id: string, used: boolean) {
  return adminAction(async (admin) => {
    await markPassUsed(String(id), admin.adminId, !!used);
    revalidatePath("/admin/passes");
  }, used ? "使用済みにしました" : "未使用に戻しました");
}
