import { BottomNav } from "@/components/member/BottomNav";
import { BrandHeader } from "@/components/member/BrandHeader";
import { LineLinker } from "@/components/member/LineLinker";
import { lineLoginEnabled } from "@/server/line";
import { getMember } from "@/server/member-auth";
import { getBrand } from "@/server/settings";

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const [brand, member] = await Promise.all([getBrand(), getMember()]);
  // 公式LINE を始めた後、仮登録の会員が開いたら LINE を紐付ける
  const needsLink = lineLoginEnabled() && member && !member.lineUserId;
  return (
    <div className="min-h-dvh bg-mochi-50">
      <header className="sticky top-0 z-10 border-b border-rose-100 bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-md px-4 py-2">
          <BrandHeader brand={brand} />
        </div>
      </header>
      <main className="mx-auto max-w-md px-4 pt-4 pb-28">
        {needsLink && <LineLinker liffId={process.env.NEXT_PUBLIC_LIFF_ID ?? ""} />}
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
