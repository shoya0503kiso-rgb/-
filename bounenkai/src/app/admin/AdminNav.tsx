"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

const ITEMS = [
  { href: "/admin", label: "予約一覧", exact: true },
  { href: "/admin/notifications", label: "通知履歴" },
  { href: "/admin/staff", label: "スタッフ" },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="mx-auto max-w-5xl overflow-x-auto px-2">
      <ul className="flex gap-1 text-sm">
        {ITEMS.map((i) => {
          const active = i.exact ? path === i.href : path.startsWith(i.href);
          return (
            <li key={i.href}>
              <Link
                href={i.href}
                className={cx(
                  "block border-b-2 px-3 py-2 whitespace-nowrap",
                  active ? "border-amber-600 font-bold text-amber-800" : "border-transparent text-slate-600 hover:text-slate-900",
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
