import { LoginForm } from "./LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-1 text-xl font-bold">シフト管理くん</h1>
        <p className="mb-6 text-sm text-slate-600">管理者ログイン</p>
        <LoginForm next={next ?? "/admin"} />
      </div>
    </main>
  );
}
