import { redirect } from "next/navigation";
import { getAdmin, getKioskDevice, logoutAdmin, registerKioskDevice } from "@/server/auth";
import { Button, Card, Field, Input } from "@/components/ui";

export default async function KioskSetupPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login?next=/kiosk/setup");
  const current = await getKioskDevice();

  async function register(form: FormData) {
    "use server";
    if (!(await getAdmin())) redirect("/login?next=/kiosk/setup");
    await registerKioskDevice(String(form.get("name") ?? ""));
    // 打刻端末に管理者ログインを残さない（スタッフが管理画面に入れないように）
    await logoutAdmin();
    redirect("/kiosk");
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <Card title="打刻端末の登録">
        {current && <p className="mb-4 text-sm text-emerald-700">この端末は「{current.name}」として登録済みです。再登録すると新しい端末として登録されます。</p>}
        <form action={register} className="space-y-4">
          <Field label="端末名" hint="例：店舗iPad（レジ横）">
            <Input name="name" defaultValue="店舗iPad" required />
          </Field>
          <p className="text-sm text-slate-600">
            登録すると、この端末のブラウザでは管理者ログインなしで打刻画面を使えます。
            <b>登録後、この端末の管理者ログインは自動で解除されます。</b>
            紛失時は「店舗設定」から登録を解除してください。
          </p>
          <Button type="submit" className="w-full">この端末を登録して打刻画面へ</Button>
        </form>
      </Card>
    </main>
  );
}
