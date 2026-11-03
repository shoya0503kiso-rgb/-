"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { lineLoginAction } from "@/app/join/actions";

/**
 * 仮登録の会員に LINE を紐付ける（ポイントはそのまま引き継ぎ）。
 * LINE アプリ内で開いたら自動で、外部ブラウザではボタンから
 */
export function LineLinker({ liffId }: { liffId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"hidden" | "button" | "error">("hidden");
  const [message, setMessage] = useState("");
  const liffRef = useRef<typeof import("@line/liff").default | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const liff = (await import("@line/liff")).default;
        await liff.init({ liffId });
        liffRef.current = liff;
        if (cancelled) return;
        if (liff.isLoggedIn()) {
          const token = liff.getIDToken();
          if (!token) throw new Error("no id token");
          const res = await lineLoginAction(token);
          if (!res.ok) {
            setMessage(res.error);
            setState("error");
            return;
          }
          router.refresh();
          return;
        }
        if (liff.isInClient()) liff.login({ redirectUri: window.location.href });
        else setState("button");
      } catch {
        if (!cancelled) setState("button");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [liffId, router]);

  if (state === "hidden") return null;
  return (
    <div className="mb-4 rounded-2xl bg-white p-3 text-center shadow-sm ring-1 ring-emerald-200">
      {state === "error" ? (
        <p className="text-sm text-red-600">{message}</p>
      ) : (
        <>
          <p className="text-xs text-slate-600">LINE と連携すると、LINE からいつでも開けます（ポイントはそのまま）</p>
          <button
            onClick={() => liffRef.current?.login({ redirectUri: window.location.href })}
            className="mt-2 w-full rounded-xl bg-[#06C755] py-2 text-sm font-bold text-white"
          >
            LINE と連携する
          </button>
        </>
      )}
    </div>
  );
}
