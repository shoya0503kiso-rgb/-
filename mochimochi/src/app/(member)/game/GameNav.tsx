"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

const ITEMS = [
  { href: "/game", label: "デイリー", icon: "🎲" },
  { href: "/game/slot", label: "スロット", icon: "🎰" },
  { href: "/game/lottery", label: "宝くじ", icon: "🎟️" },
];

export function GameNav() {
  const path = usePathname();
  return (
    <nav className="grid grid-cols-3 gap-1 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-500 p-1 shadow-sm" aria-label="ゲームコーナー">
      {ITEMS.map((it) => {
        const active = path === it.href;
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={cx("rounded-xl py-2 text-center text-sm font-black transition-colors", active ? "bg-white text-rose-600 shadow" : "text-white/90")}
          >
            <span className="mr-1" aria-hidden>
              {it.icon}
            </span>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
