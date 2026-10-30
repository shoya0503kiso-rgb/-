import { headers } from "next/headers";
import { Alert, Card, LinkButton, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/time";
import { todayCheckin } from "@/server/checkin";
import { qrSvg } from "@/server/qr";
import { getSettings } from "@/server/settings";
import { QrButtons } from "./QrButtons";

export default async function QrAdmin() {
  const [s, today] = await Promise.all([getSettings(), todayCheckin()]);
  const svg = await qrSvg(today.url);
  const h = await headers();
  const origin = process.env.APP_BASE_URL?.replace(/\/$/, "") || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const displayUrl = `${origin}/display/qr?k=${s.qrDisplayKey}`;
  return (
    <div className="space-y-4">
      <PageHeader title="来店チェックインQR" description="QRは営業日ごとに自動で変わります" actions={<LinkButton href={`/display/qr?k=${s.qrDisplayKey}`} target="_blank">全画面で表示</LinkButton>} />
      <p className="-mt-3 text-sm text-slate-600">切替時刻：毎日 {s.dayChangeHour}:00（設定で変更）。お客さんはスマホのカメラで読み取ります。1人1日1回まで。</p>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title={`今日（${formatDate(today.date)}）のQR`}>
          <div className="mx-auto max-w-xs" dangerouslySetInnerHTML={{ __html: svg }} />
          <p className="mt-2 text-center text-xs break-all text-slate-400">{today.url}</p>
        </Card>
        <Card title="店内タブレットに表示する">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
            <li>
              タブレットのブラウザで下のURLを開く（スタッフのログインは不要）
              <div className="mt-1 rounded bg-slate-100 p-2 font-mono text-xs break-all">{displayUrl}</div>
            </li>
            <li>「ホーム画面に追加」しておくと次から1タップで開けます</li>
            <li>表示は数分ごとに自動で更新され、日付が変わると新しいQRになります</li>
          </ol>
          {!process.env.APP_BASE_URL && <Alert kind="warn">環境変数 APP_BASE_URL が未設定です。QRの読み取り先URLが正しくない場合があります</Alert>}
          <QrButtons />
        </Card>
      </div>
    </div>
  );
}
