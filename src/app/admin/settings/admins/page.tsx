import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import { listAdmins } from "@/server/admins";
import { requireAdmin } from "@/server/auth";
import { AdminActiveButton, ChangePasswordForm, NewAdminForm } from "./AdminForms";

export default async function AdminsPage({ searchParams }: { searchParams: Promise<{ first?: string }> }) {
  const { first } = await searchParams;
  const me = await requireAdmin({ allowMustChange: true });
  const admins = await listAdmins();
  return (
    <div className="space-y-5">
      <PageHeader title="管理者アカウント" description="店長・シフト担当など、管理画面に入れる人（権限は全員同じ：P-16）" />
      {first && <Alert kind="warn">初期パスワード（または仮パスワード）のままです。安全のため、先にパスワードを変更してください。</Alert>}
      <Card title="自分のパスワードを変更">
        <ChangePasswordForm />
      </Card>
      <Card title="管理者一覧">
        <ul className="divide-y divide-slate-100">
          {admins.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <b>{a.name}</b>
                <span className="ml-2 text-sm text-slate-500">ID: {a.loginId}</span>
                {a.id === me.adminId && <span className="ml-2"><Badge color="teal">自分</Badge></span>}
                {!a.active && <span className="ml-2"><Badge>停止中</Badge></span>}
                {a.mustChangePassword && <span className="ml-2"><Badge color="amber">初期パスワードのまま</Badge></span>}
              </span>
              {a.id !== me.adminId && <AdminActiveButton id={a.id} active={a.active} />}
            </li>
          ))}
        </ul>
      </Card>
      <Card title="管理者を追加">
        <NewAdminForm />
      </Card>
    </div>
  );
}
