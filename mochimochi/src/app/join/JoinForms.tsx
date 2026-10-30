"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { lineLoginAction, linkCodeAction, signupAction } from "./actions";

export function JoinForms({ next, lineEnabled, liffId, guestEnabled }: { next: string; lineEnabled: boolean; liffId: string; guestEnabled: boolean }) {
  const [mode, setMode] = useState<"main" | "code">("main");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(fn: () => Promise<{ ok: false; error: string } | { ok: true } | undefined>) {
    setBusy(true);
    setError("");
    const res = await fn();
    // 成功時はサーバー側でリダイレクトされる
    if (res && !res.ok) {
      setError(res.error);
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 space-y-4">
      {lineEnabled && <LineLogin liffId={liffId} next={next} />}

      {mode === "main" && guestEnabled && (
        <form
          className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-rose-100"
          onSubmit={(e) => {
            e.preventDefault();
            const nickname = String(new FormData(e.currentTarget).get("nickname") ?? "");
            void submit(() => signupAction(nickname, next));
          }}
        >
          <label className="block">
            <span className="mb-1 block text-sm font-bold text-slate-700">{lineEnabled ? "LINE を使わずに登録" : "ニックネームで登録"}</span>
            <input
              name="nickname"
              required
              maxLength={20}
              placeholder="例：もっちー"
              className="w-full rounded-xl border border-slate-300 px-3 py-3 text-base focus:border-rose-400 focus:outline-none"
            />
          </label>
          <p className="text-xs text-slate-500">ランキングに表示される名前です（あとでスタッフが変更できます）</p>
          <button disabled={busy} className="w-full rounded-xl bg-rose-500 py-3 font-bold text-white disabled:opacity-50">
            はじめる
          </button>
        </form>
      )}

      {mode === "code" && (
        <form
          className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-rose-100"
          onSubmit={(e) => {
            e.preventDefault();
            const code = String(new FormData(e.currentTarget).get("code") ?? "");
            void submit(() => linkCodeAction(code, next));
          }}
        >
          <label className="block">
            <span className="mb-1 block text-sm font-bold text-slate-700">引き継ぎコード</span>
            <input
              name="code"
              required
              autoCapitalize="characters"
              autoComplete="off"
              placeholder="ABCD-2345"
              className="w-full rounded-xl border border-slate-300 px-3 py-3 text-center font-mono text-lg tracking-widest focus:border-rose-400 focus:outline-none"
            />
          </label>
          <p className="text-xs text-slate-500">機種変更などで前の会員情報を使うときは、スタッフにコードを発行してもらってください</p>
          <button disabled={busy} className="w-full rounded-xl bg-rose-500 py-3 font-bold text-white disabled:opacity-50">
            ログイン
          </button>
        </form>
      )}

      {error && <p className="text-center text-sm text-red-600">{error}</p>}

      <p className="text-center text-sm">
        {mode === "main" ? (
          <button onClick={() => setMode("code")} className="text-rose-600 underline">
            引き継ぎコードをお持ちの方
          </button>
        ) : (
          <button onClick={() => setMode("main")} className="text-rose-600 underline">
            ‹ 戻る
          </button>
        )}
      </p>
      {!guestEnabled && !lineEnabled && <p className="text-center text-sm text-slate-500">ただいま新規登録を停止しています</p>}
    </div>
  );
}

/** LINE アプリ内（LIFF）で開いたら自動でログイン。外部ブラウザではボタンから LINE ログイン */
function LineLogin({ liffId, next }: { liffId: string; next: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
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
            setStatus("error");
            return;
          }
          router.replace(next);
          router.refresh();
          return;
        }
        if (liff.isInClient()) {
          liff.login({ redirectUri: window.location.href });
          return;
        }
        setStatus("ready");
      } catch {
        if (!cancelled) {
          setMessage("LINE に接続できませんでした");
          setStatus("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [liffId, next, router]);

  return (
    <div className="rounded-2xl bg-white p-4 text-center shadow-sm ring-1 ring-rose-100">
      {status === "loading" && <p className="text-sm text-slate-500">LINE で確認しています…</p>}
      {status === "ready" && (
        <button
          onClick={() => liffRef.current?.login({ redirectUri: window.location.href })}
          className="w-full rounded-xl bg-[#06C755] py-3 font-bold text-white"
        >
          LINE でログイン
        </button>
      )}
      {status === "error" && <p className="text-sm text-red-600">{message}</p>}
    </div>
  );
}
