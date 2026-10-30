import { redirect } from "next/navigation";
import { needsSetup } from "@/server/admins";
import { getBrand } from "@/server/settings";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  // スタッフがまだいない（本番の初回）なら初期設定へ
  if (await needsSetup()) redirect("/setup");
  const brand = await getBrand();
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-1 text-xl font-bold">{brand.storeName}</h1>
        <p className="mb-6 text-sm text-slate-600">スタッフ用 管理画面ログイン</p>
        <LoginForm next={next ?? "/admin"} />
      </div>
    </main>
  );
}
