import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";

// 会員番号は「いまの一番大きい番号 + 1」。同時に登録されて番号がぶつかったら、取り直す

const isMemberNoClash = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && String(e.meta?.target ?? "").includes("memberNo");

async function nextNo() {
  const r = await prisma.member.aggregate({ _max: { memberNo: true } });
  return (r._max.memberNo ?? 0) + 1;
}

/** 会員を作る（会員番号を自動でつける） */
export async function createMember(data: Omit<Prisma.MemberCreateInput, "memberNo">) {
  // 前からいる会員に番号がまだなければ、先にその人たちへ（新しい人が古い人より小さい番号にならないように）
  await ensureMemberNos();
  for (let i = 0; ; i++) {
    try {
      return await prisma.member.create({ data: { ...data, memberNo: await nextNo() } });
    } catch (e) {
      if (!isMemberNoClash(e) || i >= 9) throw e;
    }
  }
}

/** 番号がまだない会員（この機能より前に登録した人）に、登録した順で番号をつける */
export async function ensureMemberNos() {
  const missing = await prisma.member.findMany({ where: { memberNo: null }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true } });
  for (const m of missing) {
    for (let i = 0; ; i++) {
      try {
        await prisma.member.updateMany({ where: { id: m.id, memberNo: null }, data: { memberNo: await nextNo() } });
        break;
      } catch (e) {
        if (!isMemberNoClash(e) || i >= 9) throw e;
      }
    }
  }
  return missing.length;
}
