import Link from "next/link";
import { getKioskDevice } from "@/server/auth";
import { kioskStatus } from "@/server/punch";
import { getSettings } from "@/server/settings";
import { KioskClient } from "./KioskClient";

export const dynamic = "force-dynamic";

export default async function KioskPage() {
  const device = await getKioskDevice();
  if (!device) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-bold">この端末は打刻端末として登録されていません</h1>
        <p className="text-slate-600">管理者がログインして、この端末を登録してください。</p>
        <Link href="/kiosk/setup" className="rounded-xl bg-teal-700 px-6 py-3 text-lg font-bold text-white">
          打刻端末として登録する
        </Link>
      </main>
    );
  }
  const [employees, settings] = await Promise.all([kioskStatus(), getSettings()]);
  return <KioskClient initial={employees} storeName={settings.storeName} />;
}
