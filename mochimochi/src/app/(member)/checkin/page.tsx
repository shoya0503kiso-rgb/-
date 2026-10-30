import { Panel } from "@/components/member/Panel";
import { prisma } from "@/server/db";
import { requireMember } from "@/server/member-auth";
import { getSettings, today } from "@/server/settings";
import { CheckinRunner } from "./CheckinRunner";

export const dynamic = "force-dynamic";

export default async function CheckinPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const code = (c ?? "").slice(0, 64);
  const member = await requireMember(code ? `/checkin?c=${encodeURIComponent(code)}` : "/checkin");
  const [s, date] = await Promise.all([getSettings(), today()]);
  const visited = await prisma.visit.findUnique({ where: { memberId_businessDate: { memberId: member.id, businessDate: date } } });

  if (!code) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">来店チェックイン</h1>
        {visited ? (
          <Panel>
            <p className="text-center font-bold text-emerald-700">✅ 今日はチェックイン済みです</p>
          </Panel>
        ) : (
          <Panel>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
              <li>お店のタブレットに表示されている QRコード をスマホのカメラで読み取ってください</li>
              <li>開いた画面でチェックイン完了！ スタンプと {s.pointName} がもらえます</li>
            </ol>
            <p className="mt-3 text-xs text-slate-500">チェックインは1日1回です。QRは毎日変わります。</p>
          </Panel>
        )}
      </div>
    );
  }

  return (
    <CheckinRunner
      code={code}
      needGeo={s.geoEnabled && s.geoLat != null && s.geoLng != null}
      alreadyVisited={!!visited}
      pointName={s.pointName}
      stampCardBonus={s.stampCardBonus}
    />
  );
}
