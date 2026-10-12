import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { changePassword, createAdmin, setAdminActive } from "@/server/admins";
import { resetDb } from "../helpers";

beforeEach(resetDb);

async function admin(loginId = "admin", password = "admin1234") {
  return prisma.adminUser.create({ data: { loginId, name: loginId, passwordHash: await bcrypt.hash(password, 4), mustChangePassword: true } });
}

describe("管理者アカウント", () => {
  it("パスワード変更：現在のパスワード必須・弱いパスワード不可・他端末のセッション失効", async () => {
    const a = await admin();
    await expect(changePassword(a.id, "wrong", "newpass123")).rejects.toThrow("現在のパスワード");
    await expect(changePassword(a.id, "admin1234", "short")).rejects.toThrow("8文字以上");
    await expect(changePassword(a.id, "admin1234", "password")).rejects.toThrow("推測されやすい");
    const u = await changePassword(a.id, "admin1234", "tsuyoi-pass-2026");
    expect(u).toMatchObject({ mustChangePassword: false, tokenVersion: 1 });
    expect(await bcrypt.compare("tsuyoi-pass-2026", u.passwordHash)).toBe(true);
  });

  it("追加・重複ID不可・自分や最後の1人は停止できない", async () => {
    const a = await admin();
    const b = await createAdmin({ loginId: "shift", name: "シフト担当", password: "karipass-01" });
    expect(b.mustChangePassword).toBe(true);
    await expect(createAdmin({ loginId: "shift", name: "x", password: "karipass-01" })).rejects.toThrow("使われています");
    await expect(setAdminActive(a.id, a.id, false)).rejects.toThrow("自分自身");
    await setAdminActive(a.id, b.id, false);
    await expect(setAdminActive(b.id, a.id, false)).rejects.toThrow("1人もいなくなる");
  });
});
