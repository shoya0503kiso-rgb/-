import { beforeEach, describe, expect, it } from "vitest";
import { formatMemberNo, parseMemberNo } from "@/lib/member-no";
import { searchMembers } from "@/server/admin-ops";
import { prisma } from "@/server/db";
import { createMember, ensureMemberNos } from "@/server/member-no";
import { makeMember, resetDb } from "../helpers";

beforeEach(resetDb);

describe("会員番号", () => {
  it("登録した順に 1, 2, 3 … と自動でつく（同時に登録してもぶつからない）", async () => {
    const a = await createMember({ nickname: "A" });
    const b = await createMember({ nickname: "B" });
    expect([a.memberNo, b.memberNo]).toEqual([1, 2]);
    const many = await Promise.all(Array.from({ length: 5 }, (_, i) => createMember({ nickname: `C${i}` })));
    expect(many.map((m) => m.memberNo).sort((x, y) => x! - y!)).toEqual([3, 4, 5, 6, 7]);
  });

  it("前からいる会員には、登録した順に番号をつける（新しい人より先に）", async () => {
    const old1 = await makeMember("古い1", { createdAt: new Date("2026-01-01") });
    const old2 = await makeMember("古い2", { createdAt: new Date("2026-02-01") });
    const no = async (id: string) => (await prisma.member.findUniqueOrThrow({ where: { id } })).memberNo;
    const first = await createMember({ nickname: "新しい1" });
    expect([await no(old1.id), await no(old2.id), first.memberNo]).toEqual([1, 2, 3]);
    expect(await ensureMemberNos()).toBe(0);
    const old3 = await makeMember("古い3", { createdAt: new Date("2026-03-01") });
    const fresh = await createMember({ nickname: "新しい2" });
    expect([await no(old3.id), fresh.memberNo]).toEqual([4, 5]);
  });

  it("番号の見せ方と、番号での検索", async () => {
    expect(formatMemberNo(12)).toBe("No.0012");
    expect(formatMemberNo(12345)).toBe("No.12345");
    expect([parseMemberNo("No.12"), parseMemberNo("0012"), parseMemberNo("12"), parseMemberNo("もっちー")]).toEqual([12, 12, 12, null]);
    await createMember({ nickname: "A" });
    const b = await createMember({ nickname: "B" });
    expect((await searchMembers("no.2")).map((m) => m.id)).toEqual([b.id]);
  });
});
