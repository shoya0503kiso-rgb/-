import Link from "next/link";
import { cx } from "@/components/ui";

export const SHIFT_TABS = [
  { key: "requests", label: "① 提出状況" },
  { key: "conditions", label: "② 月次条件" },
  { key: "board", label: "③ 作成・公開" },
] as const;

export type ShiftTab = (typeof SHIFT_TABS)[number]["key"];

export function ShiftTabs({ ym, active }: { ym: string; active: ShiftTab }) {
  return (
    <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
      {SHIFT_TABS.map((t) => (
        <Link
          key={t.key}
          href={`/admin/shifts/${ym}?tab=${t.key}`}
          className={cx("border-b-2 px-4 py-2 text-sm whitespace-nowrap", active === t.key ? "border-teal-700 font-bold text-teal-800" : "border-transparent text-slate-600")}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
