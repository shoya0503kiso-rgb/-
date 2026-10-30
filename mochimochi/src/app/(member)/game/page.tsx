import { IMG } from "@/lib/brand-images";
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
      <div className="flex items-center overflow-hidden rounded-2xl bg-[#f897b1]">
        <div className="flex-1 py-4 pl-4 text-white">
          <h1 className="text-xl font-extrabold drop-shadow">デイリーゲーム</h1>
          <p className="mt-1 text-xs font-bold drop-shadow">1日1回あそべます。勝ったら {s.pointName} ゲット！</p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={IMG.tigerPink} alt="" className="h-32 w-auto shrink-0" />
      </div>
      {pointDay && pointDay.mode === "multiply" && <p className="text-center text-sm font-bold text-amber-600">🎉 今日は{pointDayLabel(pointDay)}！</p>}
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
