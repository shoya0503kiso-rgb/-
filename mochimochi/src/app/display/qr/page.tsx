import { timingSafeEqual } from "node:crypto";
import { IMG } from "@/lib/brand-images";
import { formatDate } from "@/lib/time";
import { todayCheckin } from "@/server/checkin";
import { qrSvg } from "@/server/qr";
import { getBrand, getSettings } from "@/server/settings";
import { AutoReload } from "./AutoReload";

export const dynamic = "force-dynamic";

function keyMatches(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return b.length > 0 && x.length === y.length && timingSafeEqual(x, y);
}

/** 店内タブレット用：今日のチェックインQRを大きく表示（スタッフのログイン不要。URLのキーで保護） */
export default async function QrDisplay({ searchParams }: { searchParams: Promise<{ k?: string }> }) {
  const { k = "" } = await searchParams;
  const s = await getSettings();
  if (!keyMatches(k, s.qrDisplayKey)) {
    return <main className="flex min-h-dvh items-center justify-center p-6 text-center text-slate-600">このURLは使えません。管理画面「来店QR」から新しいURLを開いてください。</main>;
  }
  const [brand, today] = await Promise.all([getBrand(), todayCheckin()]);
  const svg = await qrSvg(today.url);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-gradient-to-b from-rose-50 to-white p-6 text-center">
      <AutoReload seconds={300} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={IMG.full} alt={brand.storeName} className="w-full max-w-sm" />
      <h1 className="text-3xl font-black text-rose-600">来店チェックイン</h1>
      {/* QRの上には何も重ねない（読み取りにくくなるため） */}
      <div className="w-full max-w-[min(55vh,26rem)] rounded-3xl bg-white p-4 shadow-xl ring-4 ring-neutral-900" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={IMG.tigerChip} alt="" className="w-24" />
        <p className="text-lg font-bold text-slate-700">スマホのカメラで読み取ってね！</p>
      </div>
      <p className="text-sm text-slate-500">
        {formatDate(today.date)} のQR ・ スタンプ＋{brand.pointName}がもらえます（1日1回）
      </p>
    </main>
  );
}
