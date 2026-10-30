// ローカル用の初期データ：スタッフ admin / admin1234（初回ログインでパスワード変更）と仮の設定値
// SEED_DEMO=1 でデモ用の会員・結果・イベントも入れる
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_PLACE_POINTS, DEFAULT_RANKS, DEFAULT_REWARDS } from "../src/lib/defaults";

const prisma = new PrismaClient();

async function main() {
  await prisma.storeSetting.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  if ((await prisma.rankTier.count()) === 0) await prisma.rankTier.createMany({ data: DEFAULT_RANKS });
  if ((await prisma.placePointRule.count()) === 0) {
    await prisma.placePointRule.createMany({
      data: Object.entries(DEFAULT_PLACE_POINTS).flatMap(([game, pts]) => pts.map((points, i) => ({ game, place: i + 1, points }))),
    });
  }
  if ((await prisma.reward.count()) === 0) await prisma.reward.createMany({ data: DEFAULT_REWARDS });

  const loginId = process.env.SEED_ADMIN_LOGIN ?? "admin";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "admin1234";
  if (!(await prisma.adminUser.findUnique({ where: { loginId } }))) {
    await prisma.adminUser.create({ data: { loginId, name: "店長", passwordHash: await bcrypt.hash(password, 10), mustChangePassword: true } });
    console.log(`スタッフを作成しました: ${loginId} / ${password}`);
  }

  if (process.env.SEED_DEMO === "1" && (await prisma.member.count()) === 0) {
    const jst = new Date(Date.now() + 9 * 3600_000 - 6 * 3600_000);
    const today = jst.toISOString().slice(0, 10);
    const month = today.slice(0, 7);
    const names = ["もっちー", "ダーツ太郎", "ポーカー姫", "サブマリン王", "常連さん"];
    const members = [];
    for (const [i, nickname] of names.entries()) {
      members.push(
        await prisma.member.create({ data: { nickname, points: 100 * (i + 1), visitCount: i * 7, stampCount: (i * 7) % 10, completedCards: Math.floor((i * 7) / 10), mochiTotal: i * 1234 } }),
      );
    }
    for (const [game, order] of [["darts", [1, 0, 4]], ["poker", [2, 4, 0]]] as const) {
      const match = await prisma.match.create({ data: { game, date: today, title: "デモ大会" } });
      for (const [k, idx] of order.entries()) {
        const points = DEFAULT_PLACE_POINTS[game][k] ?? 0;
        await prisma.matchEntry.create({ data: { matchId: match.id, memberId: members[idx].id, place: k + 1, points } });
      }
    }
    for (const [idx, n] of [[3, 7], [0, 3], [4, 2]]) {
      for (let k = 0; k < n; k++) await prisma.submarineLog.create({ data: { memberId: members[idx].id, month, delta: 1 } });
    }
    await prisma.event.create({ data: { date: today, title: "ダーツ大会", startTime: "21:00", description: "どなたでも参加OK" } });
    await prisma.pointDay.create({ data: { date: `${month}-25`, mode: "multiply", value: 2, label: "" } });
    console.log("デモ用の会員・結果・イベントを作成しました");
  }
}

main().finally(() => prisma.$disconnect());
