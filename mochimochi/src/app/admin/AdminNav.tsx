"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

const ITEMS = [
  { href: "/admin", label: "ホーム", exact: true },
  { href: "/admin/members", label: "会員" },
  { href: "/admin/results", label: "結果入力" },
  { href: "/admin/submarine", label: "サブマリン" },
  { href: "/admin/calendar", label: "カレンダー" },
  { href: "/admin/rewards", label: "交換" },
  { href: "/admin/qr", label: "来店QR" },
  { href: "/admin/settings", label: "設定" },
  { href: "/admin/staff", label: "スタッフ" },
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
                  active ? "border-rose-500 font-bold text-rose-700" : "border-transparent text-slate-600 hover:text-slate-900",
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
