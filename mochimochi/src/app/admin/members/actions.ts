"use server";

import { revalidatePath } from "next/cache";
import { adjustPoints, searchMembers } from "@/server/admin-ops";
import { adminAction } from "@/server/admin-action";
import { prisma } from "@/server/db";
import { UserError } from "@/server/errors";
import { cleanNickname, issueLinkCode } from "@/server/member-auth";

export async function searchMembersAction(q: string) {
  const res = await adminAction(async () => {
    const ms = await searchMembers(String(q ?? ""), 20);
    return ms.filter((m) => m.active).map((m) => ({ id: m.id, nickname: m.nickname, visitCount: m.visitCount }));
  });
  return res.ok ? res.data! : [];
}

export async function createMemberAction(nickname: string) {
  return adminAction(async () => {
    const m = await prisma.member.create({ data: { nickname: cleanNickname(String(nickname ?? "")) } });
    return { id: m.id, nickname: m.nickname, visitCount: 0 };
  });
}

export async function adjustPointsAction(memberId: string, amount: number, note: string) {
  return adminAction(async (admin) => {
    await adjustPoints(String(memberId), Number(amount), String(note ?? ""), admin.adminId);
    revalidatePath(`/admin/members/${memberId}`);
  }, "ポイントを変更しました");
}

export async function updateMemberAction(memberId: string, data: { nickname: string; memo: string; active: boolean }) {
  return adminAction(async () => {
    const memo = String(data.memo ?? "");
    if (memo.length > 500) throw new UserError("メモは500文字までです");
    await prisma.member.update({
      where: { id: String(memberId) },
      // 停止したら発行済みのログインも無効にする
      data: { nickname: cleanNickname(String(data.nickname ?? "")), memo, active: !!data.active, ...(data.active ? {} : { tokenVersion: { increment: 1 } }) },
    });
    revalidatePath(`/admin/members/${memberId}`);
  }, "保存しました");
}

export async function issueLinkCodeAction(memberId: string) {
  return adminAction(() => issueLinkCode(String(memberId)));
}
