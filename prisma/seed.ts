// 初期データ投入: npm run db:seed
//   SEED_ADMIN_PASSWORD を指定しない場合は "admin1234"（本番では必ず変更すること）
//   SEED_DEMO=1 でデモ用の従業員・シフト枠を作成
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  await prisma.storeSetting.upsert({ where: { id: 1 }, create: { id: 1, storeName: "ポーカー店" }, update: {} });

  const loginId = process.env.SEED_ADMIN_LOGIN ?? "admin";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "admin1234";
  const exists = await prisma.adminUser.findUnique({ where: { loginId } });
  if (!exists) {
    await prisma.adminUser.create({ data: { loginId, name: "店長", passwordHash: await bcrypt.hash(password, 10) } });
    console.log(`管理者を作成しました: ID=${loginId}${process.env.SEED_ADMIN_PASSWORD ? "" : " / パスワード=admin1234（必ず変更してください）"}`);
  }

  if (process.env.SEED_DEMO === "1" && (await prisma.employee.count()) === 0) {
    const names = [
      ["山田 太郎", "やまだ"],
      ["佐藤 花子", "さとう"],
      ["鈴木 一郎", "すずき"],
      ["高橋 美咲", "たかはし"],
      ["田中 健", "たなか"],
      ["伊藤 さくら", "いとう"],
    ];
    for (const [i, [name, kana]] of names.entries()) {
      await prisma.employee.create({ data: { name, kana, sortOrder: i, hourlyWage: 1200 } });
    }
    if ((await prisma.shiftPattern.count()) === 0) {
      const early = await prisma.shiftPattern.create({ data: { name: "早番", startTime: "15:00", endTime: "23:00", sortOrder: 0 } });
      const late = await prisma.shiftPattern.create({ data: { name: "遅番", startTime: "20:00", endTime: "05:00", sortOrder: 1 } });
      for (let w = 0; w < 7; w++) {
        const weekend = w === 0 || w === 5 || w === 6;
        await prisma.staffingRule.create({ data: { weekday: w, patternId: early.id, requiredCount: weekend ? 2 : 1 } });
        await prisma.staffingRule.create({ data: { weekday: w, patternId: late.id, requiredCount: weekend ? 2 : 1 } });
      }
    }
    console.log("デモ用の従業員・シフト枠を作成しました");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
