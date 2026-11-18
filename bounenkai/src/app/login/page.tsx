import { redirect } from "next/navigation";
import { STORE } from "@/lib/config";
import { needsSetup } from "@/server/admins";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  // スタッフがまだいない（本番の初回）なら初期設定へ
  if (await needsSetup()) redirect("/setup");
  return (
    <main className="admin-root flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-1 text-xl font-bold">{STORE.name} 忘年会予約</h1>
        <p className="mb-6 text-sm text-slate-600">スタッフ用 管理画面ログイン</p>
        <LoginForm next={next ?? "/admin"} />
      </div>
    </main>
  );
}
