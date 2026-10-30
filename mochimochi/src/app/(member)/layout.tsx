import { BottomNav } from "@/components/member/BottomNav";
import { BrandHeader } from "@/components/member/BrandHeader";
import { getBrand } from "@/server/settings";

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const brand = await getBrand();
  return (
    <div className="min-h-dvh bg-mochi-50">
      <header className="sticky top-0 z-10 border-b border-rose-100 bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-md px-4 py-2">
          <BrandHeader brand={brand} />
        </div>
      </header>
      <main className="mx-auto max-w-md px-4 pt-4 pb-28">{children}</main>
      <BottomNav />
    </div>
  );
}
