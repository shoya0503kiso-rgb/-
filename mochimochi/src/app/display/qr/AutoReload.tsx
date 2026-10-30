"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** 一定時間ごとに再読み込み（営業日が変わったら新しいQRになる） */
export function AutoReload({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
