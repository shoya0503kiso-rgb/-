import Link from "next/link";
import { STORE } from "@/lib/config";
import { requireAdmin } from "@/server/auth";
import { logoutAction } from "../login/actions";
import { AdminNav } from "./AdminNav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin({ allowMustChange: true }); // 画面ごとの強制は middleware
  return (
    <div className="admin-root">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2">
          <Link href="/admin" className="truncate font-bold text-amber-800">
            {STORE.name} 忘年会予約 管理
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
      <main className="mx-auto max-w-5xl px-4 py-5">{children}</main>
    </div>
  );
}
