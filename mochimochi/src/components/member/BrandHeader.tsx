import Link from "next/link";
import type { Brand } from "@/server/settings";

/** ロゴと店名（ロゴ・店名は管理画面「設定 → 見た目」で差し替え） */
export function BrandHeader({ brand, href = "/me" }: { brand: Brand; href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={brand.logoUrl} alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-full bg-white object-contain shadow-sm" />
      <div className="min-w-0 leading-tight">
        <div className="truncate font-bold text-slate-900">{brand.storeName}</div>
        {brand.storeSubName && <div className="truncate text-[11px] tracking-wide text-rose-500">{brand.storeSubName}</div>}
      </div>
    </Link>
  );
}
