"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

const ITEMS = [
  { href: "/me", label: "ホーム", icon: "🏠" },
  { href: "/game", label: "ゲーム", icon: "🎲" },
  { href: "/mochi", label: "なでなで", icon: "🐯" },
  { href: "/ranking", label: "ランキング", icon: "🏆" },
  { href: "/calendar", label: "予定", icon: "📅" },
];

export function BottomNav({ showRanking = true }: { showRanking?: boolean }) {
  const path = usePathname();
  const items = ITEMS.filter((it) => showRanking || it.href !== "/ranking");
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-rose-100 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className={cx("mx-auto grid max-w-md", items.length === 5 ? "grid-cols-5" : "grid-cols-4")}>
        {items.map((it) => {
          const active = path === it.href || path.startsWith(`${it.href}/`);
          return (
            <li key={it.href}>
              <Link href={it.href} className={cx("flex flex-col items-center gap-0.5 py-2 text-[11px]", active ? "font-bold text-rose-600" : "text-slate-500")}>
                <span className="text-xl leading-none" aria-hidden>
                  {it.icon}
                </span>
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
