import { redirect } from "next/navigation";
import { BrandHeader } from "@/components/member/BrandHeader";
import { safeNextPath } from "@/server/auth";
import { lineLoginEnabled } from "@/server/line";
import { getMember } from "@/server/member-auth";
import { getBrand, getSettings } from "@/server/settings";
import { JoinForms } from "./JoinForms";

export const dynamic = "force-dynamic";

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const next = safeNextPath(sp.next ?? "/me", "/me");
  const lineEnabled = lineLoginEnabled();
  const [brand, s, member] = await Promise.all([getBrand(), getSettings(), getMember()]);
  // ログイン済みならそのまま（仮登録の会員への LINE の紐付けは、お客さん画面の上部で行う）
  if (member) redirect(next);

  return (
    <div className="min-h-dvh bg-mochi-50">
      <div className="mx-auto max-w-md px-4 py-8">
        <div className="flex justify-center">
          <BrandHeader brand={brand} href="/join" />
        </div>
        <div className="mt-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={brand.logoUrl} alt={brand.storeName} className="mx-auto h-36 w-36 rounded-full bg-white object-contain shadow" />
          <h1 className="mt-4 text-2xl font-extrabold text-slate-900">会員になって遊ぼう！</h1>
          <p className="mt-2 text-sm text-slate-600">
            来店スタンプ・デイリーゲーム・ランキングで
            <br />
            <b className="text-rose-600">{brand.pointName}</b> をためよう
          </p>
        </div>
        <JoinForms
          next={next}
          lineEnabled={lineEnabled}
          liffId={process.env.NEXT_PUBLIC_LIFF_ID ?? ""}
          guestEnabled={s.guestSignupEnabled}
        />
      </div>
    </div>
  );
}
