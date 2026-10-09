import { requireAdmin } from "@/server/auth";
import { logoutAction } from "../login/actions";
import { AdminNav } from "./AdminNav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div className="min-h-dvh">
      <header className="no-print sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2">
          <a href="/admin" className="font-bold text-teal-800">シフト管理くん</a>
          <div className="flex items-center gap-3 text-sm text-slate-600">
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
