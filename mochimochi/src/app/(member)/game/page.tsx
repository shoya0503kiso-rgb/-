import { applyPointDay, pointDayLabel } from "@/server/points";
import { prisma } from "@/server/db";
import { requireMember } from "@/server/member-auth";
import { getSettings, today } from "@/server/settings";
import { GameBoard } from "./GameBoard";

export const dynamic = "force-dynamic";

export default async function GamePage() {
  const member = await requireMember("/game");
  const [s, date] = await Promise.all([getSettings(), today()]);
  const [played, pointDay] = await Promise.all([
    prisma.gamePlay.findUnique({ where: { memberId_businessDate: { memberId: member.id, businessDate: date } } }),
    prisma.pointDay.findUnique({ where: { date } }),
  ]);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">デイリーゲーム</h1>
        <p className="text-sm text-slate-600">1日1回あそべます。勝ったら {s.pointName} ゲット！</p>
        {pointDay && pointDay.mode === "multiply" && <p className="mt-1 text-sm font-bold text-amber-600">🎉 今日は{pointDayLabel(pointDay)}！</p>}
      </div>
      <GameBoard
        played={played ? { game: played.game, result: played.result, points: played.points } : null}
        pointName={s.pointName}
        rewards={{
          janken: applyPointDay(s.jankenWinPoints, pointDay, "game"),
          chinchiro: applyPointDay(s.chinchiroWinPoints, pointDay, "game"),
          chinchiroBig: applyPointDay(s.chinchiroBigWinPoints, pointDay, "game"),
        }}
      />
    </div>
  );
}
