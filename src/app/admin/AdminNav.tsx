"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

const ITEMS = [
  { href: "/admin", label: "ホーム", exact: true },
  { href: "/admin/attendance", label: "勤怠" },
  { href: "/admin/anomalies", label: "要確認" },
  { href: "/admin/shifts", label: "シフト" },
  { href: "/admin/employees", label: "従業員" },
  { href: "/admin/export", label: "出力" },
  { href: "/admin/payroll", label: "給与目安" },
  { href: "/admin/analytics", label: "分析" },
  { href: "/admin/line", label: "LINE" },
  { href: "/admin/settings", label: "設定" },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="mx-auto max-w-6xl overflow-x-auto px-2">
      <ul className="flex gap-1 text-sm">
        {ITEMS.map((i) => {
          const active = i.exact ? path === i.href : path.startsWith(i.href);
          return (
            <li key={i.href}>
              <Link
                href={i.href}
                className={cx(
                  "block border-b-2 px-3 py-2 whitespace-nowrap",
                  active ? "border-teal-700 font-bold text-teal-800" : "border-transparent text-slate-600 hover:text-slate-900",
                )}
              >
                {i.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
