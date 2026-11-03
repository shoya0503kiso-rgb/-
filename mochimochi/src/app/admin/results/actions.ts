"use server";

import { revalidatePath } from "next/cache";
import { createMatch, deleteMatch } from "@/server/admin-ops";
import { adminAction } from "@/server/admin-action";
import { UserError } from "@/server/errors";
import { isGameKind } from "@/server/rankings";

export async function createMatchAction(input: { game: string; date: string; title: string; entries: { memberId: string; place: number }[] }) {
  return adminAction(async (admin) => {
    if (!isGameKind(String(input.game))) throw new UserError("種目を選んでください");
    const entries = (Array.isArray(input.entries) ? input.entries : []).slice(0, 200).map((e) => ({ memberId: String(e.memberId), place: Number(e.place) }));
    await createMatch({ game: input.game as "darts" | "poker", date: String(input.date), title: String(input.title ?? "").slice(0, 50), entries }, admin.adminId);
    revalidatePath("/admin/results");
  }, "結果を登録し、ポイントを付与しました");
}

export async function deleteMatchAction(matchId: string) {
  return adminAction(async (admin) => {
    await deleteMatch(String(matchId), admin.adminId);
    revalidatePath("/admin/results");
  }, "取り消しました");
}
