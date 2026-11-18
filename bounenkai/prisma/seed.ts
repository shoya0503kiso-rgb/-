// ローカル用の初期データ：スタッフ admin / admin1234（初回ログインでパスワード変更）
// SEED_DEMO=1 でデモ用の予約も入れる
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const loginId = process.env.SEED_ADMIN_LOGIN ?? "admin";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "admin1234";
  if (!(await prisma.adminUser.findUnique({ where: { loginId } }))) {
    await prisma.adminUser.create({ data: { loginId, name: "店長", passwordHash: await bcrypt.hash(password, 10), mustChangePassword: true } });
    console.log(`スタッフを作成しました: ${loginId} / ${password}`);
  }
  if (process.env.SEED_DEMO === "1" && (await prisma.reservation.count()) === 0) {
    const y = new Date(Date.now() + 9 * 3600_000).getUTCFullYear();
    const demo = [
      { code: "DEMO01", date: `${y}-12-04`, startMin: 17 * 60, extensionHours: 0, plan: "basic", people: 12, hors: false, estimate: 48000, groupType: "company", companyName: "デモ商事" },
      { code: "DEMO02", date: `${y}-12-04`, startMin: 20 * 60, extensionHours: 1, plan: "casino", people: 20, hors: true, estimate: 180000, groupType: "company", companyName: "サンプル工業" },
      { code: "DEMO03", date: `${y}-12-11`, startMin: 19 * 60, extensionHours: 0, plan: "casino", people: 9, hors: false, estimate: 49500, groupType: "friends", companyName: "" },
    ];
    for (const d of demo) {
      await prisma.reservation.create({
        data: { ...d, representative: "デモ 太郎", phone: "090-0000-0000", email: "demo@example.com", bookedPeople: d.people },
      });
    }
    console.log("デモ用の予約を入れました");
  }
}

main().finally(() => prisma.$disconnect());
