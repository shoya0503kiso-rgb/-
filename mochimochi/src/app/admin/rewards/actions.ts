"use server";

import { revalidatePath } from "next/cache";
import { handleRedemption } from "@/server/admin-ops";
import { adminAction } from "@/server/admin-action";
import { prisma } from "@/server/db";
import { UserError } from "@/server/errors";

export async function handleRedemptionAction(id: string, action: "done" | "cancel") {
  return adminAction(async (admin) => {
    await handleRedemption(String(id), action === "cancel" ? "cancel" : "done", admin.adminId);
    revalidatePath("/admin/rewards");
  }, action === "cancel" ? "取り消してポイントを戻しました" : "提供済みにしました");
}

export async function saveRewardAction(input: { id?: string; name: string; cost: number; description: string; active: boolean; sortOrder: number }) {
  return adminAction(async () => {
    const name = String(input.name ?? "").trim();
    const cost = Number(input.cost);
    if (!name) throw new UserError("名前を入れてください");
    if (!Number.isInteger(cost) || cost < 1 || cost > 1_000_000) throw new UserError("必要ポイントは1以上の整数で入れてください");
    const data = {
      name: name.slice(0, 40),
      cost,
      description: String(input.description ?? "").slice(0, 200),
      active: !!input.active,
      sortOrder: Number.isInteger(Number(input.sortOrder)) ? Number(input.sortOrder) : 0,
    };
    if (input.id) await prisma.reward.update({ where: { id: String(input.id) }, data });
    else await prisma.reward.create({ data });
    revalidatePath("/admin/rewards");
  }, "保存しました");
}

export async function deleteRewardAction(id: string) {
  return adminAction(async () => {
    await prisma.reward.delete({ where: { id: String(id) } });
    revalidatePath("/admin/rewards");
  }, "削除しました");
}
