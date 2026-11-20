import { lotteryView } from "@/server/casino";
import { requireMember } from "@/server/member-auth";
import { getSettings } from "@/server/settings";
import { LotteryBoard } from "./LotteryBoard";

export const dynamic = "force-dynamic";

export default async function LotteryPage() {
  const member = await requireMember("/game/lottery");
  // 開いたときに、終わった抽選の当たりを自動で払い出す
  const [view, s] = await Promise.all([lotteryView(member.id), getSettings()]);
  if (!view.enabled && view.draws.length === 0) {
    return <p className="rounded-2xl bg-white p-6 text-center text-slate-600 ring-1 ring-rose-100">宝くじはいまお休み中です</p>;
  }
  return <LotteryBoard view={view} pointName={s.pointName} characterName={s.characterName} />;
}
