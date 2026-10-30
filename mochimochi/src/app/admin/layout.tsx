import Link from "next/link";
import { requireAdmin } from "@/server/auth";
import { getBrand } from "@/server/settings";
import { logoutAction } from "../login/actions";
import { AdminNav } from "./AdminNav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin({ allowMustChange: true }); // 画面ごとの強制は middleware
  const brand = await getBrand();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2">
          <Link href="/admin" className="flex min-w-0 items-center gap-2 font-bold text-rose-700">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={brand.logoUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-contain" />
            <span className="truncate">{brand.storeName} 管理</span>
          </Link>
          <div className="flex shrink-0 items-center gap-3 text-sm text-slate-600">
            <span className="hidden sm:inline">{admin.name}</span>
            <form action={logoutAction}>
              <button className="rounded px-2 py-1 hover:bg-slate-100">ログアウト</button>
            </form>
          </div>
        </div>
        <AdminNav />
      </header>
      <main className="mx-auto max-w-6xl px-4 py-5">{children}</main>
    </div>
  );
}
