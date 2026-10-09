"use client";
import { useEffect } from "react";

// 打刻画面で予期しないエラーが起きたら、数秒後に自動で再読み込みする（iPadを放置しても復旧する）
export default function KioskError() {
  useEffect(() => {
    const id = setTimeout(() => location.reload(), 5000);
    return () => clearTimeout(id);
  }, []);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-bold">通信エラーが発生しました</h1>
      <p className="text-slate-600">5秒後に自動で再読み込みします。直前の打刻が反映されているか、画面で確認してください。</p>
      <button onClick={() => location.reload()} className="rounded-xl bg-teal-700 px-6 py-3 text-lg font-bold text-white">今すぐ再読み込み</button>
    </main>
  );
}
