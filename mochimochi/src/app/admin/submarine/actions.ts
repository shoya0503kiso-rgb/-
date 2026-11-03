"use server";

import { revalidatePath } from "next/cache";
import { addSubmarine } from "@/server/admin-ops";
import { adminAction } from "@/server/admin-action";

export async function submarineAction(memberId: string, delta: number) {
  return adminAction(async (admin) => {
    const r = await addSubmarine(String(memberId), delta < 0 ? -1 : 1, admin.adminId);
    revalidatePath("/admin/submarine");
    return r;
  });
}
