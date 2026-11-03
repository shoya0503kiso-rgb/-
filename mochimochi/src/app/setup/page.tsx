import { redirect } from "next/navigation";
import { needsSetup } from "@/server/admins";
import { SetupForm } from "./SetupForm";

export const dynamic = "force-dynamic";

// 本番の初回だけ使う画面：最初のスタッフ（店長）を作る。1人でもいれば使えない
export default async function SetupPage() {
  if (!(await needsSetup())) redirect("/login");
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-1 text-xl font-bold">管理画面 初期設定</h1>
        <p className="mb-6 text-sm text-slate-600">最初のスタッフ（店長）を作成します。セットアップキーは Vercel の環境変数 SETUP_TOKEN に設定した値です。</p>
        <SetupForm />
      </div>
    </main>
  );
}
