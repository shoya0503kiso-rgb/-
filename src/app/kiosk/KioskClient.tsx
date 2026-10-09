"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { cx } from "@/components/ui";
import type { KioskEmployee, PunchType, WorkStatus } from "@/server/punch";
import { punchAction, refreshKioskAction } from "./actions";

const LABEL: Record<PunchType, string> = { CLOCK_IN: "出勤", CLOCK_OUT: "退勤", BREAK_START: "休憩開始", BREAK_END: "休憩終了" };
const STATUS: Record<WorkStatus, { text: string; cls: string }> = {
  OFF: { text: "", cls: "border-slate-200 bg-white" },
  WORKING: { text: "勤務中", cls: "border-emerald-400 bg-emerald-50" },
  ON_BREAK: { text: "休憩中", cls: "border-amber-400 bg-amber-50" },
};
const ACTION_STYLE: Record<PunchType, string> = {
  CLOCK_IN: "bg-teal-700 text-white",
  BREAK_START: "bg-amber-500 text-white",
  BREAK_END: "bg-emerald-600 text-white",
  CLOCK_OUT: "bg-slate-800 text-white",
};

const hm = (d: Date | null) =>
  d ? new Date(d).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" }) : "";

function actionsFor(status: WorkStatus): PunchType[] {
  if (status === "OFF") return ["CLOCK_IN"];
  if (status === "WORKING") return ["BREAK_START", "CLOCK_OUT"];
  return ["BREAK_END", "CLOCK_OUT"];
}

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!now) return null;
  const date = now.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short", timeZone: "Asia/Tokyo" });
  const time = now.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" });
  return (
    <div className="text-right leading-tight">
      <div className="text-sm text-slate-300">{date}</div>
      <div className="text-3xl font-bold tabular-nums">{time}</div>
    </div>
  );
}

export function KioskClient({ initial, storeName }: { initial: KioskEmployee[]; storeName: string }) {
  const [employees, setEmployees] = useState(initial);
  const [selected, setSelected] = useState<KioskEmployee | null>(null);
  const [pending, setPending] = useState<PunchType | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ message: string; type: PunchType } | null>(null);
  const [isPending, startTransition] = useTransition();
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failures = useRef(0);
  // 再デプロイ後などで通信が続けて失敗したら、画面を読み込み直して回復する
  const noteFailure = useCallback(() => {
    failures.current += 1;
    if (failures.current >= 2) location.reload();
  }, []);

  const refresh = useCallback(() => {
    startTransition(async () => {
      try {
        const r = await refreshKioskAction();
        failures.current = 0;
        if (r.ok && r.data) setEmployees(r.data);
      } catch {
        noteFailure();
      }
    });
  }, [noteFailure]);

  const close = useCallback(() => {
    setSelected(null);
    setPending(null);
    setPin("");
    setError(null);
  }, []);

  // 定期更新・画面復帰時の更新
  useEffect(() => {
    const id = setInterval(refresh, 60_000);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  // 操作途中で放置されたら名前一覧に戻る
  useEffect(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (selected) idleTimer.current = setTimeout(close, 30_000);
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [selected, pin, pending, close]);

  // 完了表示は数秒で自動的に閉じる
  useEffect(() => {
    if (!done) return;
    const id = setTimeout(() => setDone(null), 4000);
    return () => clearTimeout(id);
  }, [done]);

  function submit(emp: KioskEmployee, type: PunchType, pinValue?: string) {
    setError(null);
    startTransition(async () => {
      let r: Awaited<ReturnType<typeof punchAction>>;
      try {
        r = await punchAction(emp.id, type, pinValue);
        failures.current = 0;
      } catch {
        noteFailure();
        setError("通信エラーで打刻できませんでした。もう一度押してください。");
        setPin("");
        return;
      }
      if (r.ok && r.data) {
        setDone({ message: r.data.message, type });
        close();
        refresh();
      } else if (!r.ok) {
        setError(r.error);
        setPin("");
      }
    });
  }

  function choose(type: PunchType) {
    if (!selected) return;
    if (selected.hasPin) {
      setPending(type);
      setPin("");
      setError(null);
    } else {
      submit(selected, type);
    }
  }

  function pressDigit(d: string) {
    if (!selected || !pending || isPending) return;
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (next.length === 4) submit(selected, pending, next);
  }

  return (
    <main className="min-h-dvh bg-slate-100 select-none">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-slate-900 px-5 py-3 text-white">
        <div>
          <div className="text-lg font-bold">{storeName} 打刻</div>
          <div className="text-sm text-slate-300">名前をタップしてください</div>
        </div>
        <Clock />
      </header>

      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
        {employees.map((e) => (
          <button
            key={e.id}
            onClick={() => setSelected(e)}
            className={cx("flex min-h-24 flex-col items-start justify-between rounded-2xl border-2 p-4 text-left shadow-sm active:scale-[0.98]", STATUS[e.status].cls)}
          >
            <span className="text-2xl font-bold">{e.name}</span>
            <span className="text-sm text-slate-600">
              {e.status !== "OFF" && (
                <>
                  <b className={e.status === "WORKING" ? "text-emerald-700" : "text-amber-700"}>{STATUS[e.status].text}</b>
                  {" "}
                  {hm(e.since)}〜
                </>
              )}
            </span>
          </button>
        ))}
        {employees.length === 0 && <p className="col-span-full py-10 text-center text-slate-500">従業員が登録されていません</p>}
      </div>

      {selected && (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/50 sm:items-center" onClick={close}>
          <div className="w-full max-w-lg rounded-t-3xl bg-white p-6 sm:rounded-3xl" onClick={(ev) => ev.stopPropagation()} role="dialog" aria-label={`${selected.name}さんの打刻`}>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <div className="text-3xl font-bold">{selected.name}さん</div>
                <div className="mt-1 text-slate-600">
                  {selected.status !== "OFF"
                    ? `${STATUS[selected.status].text}（${hm(selected.since)}〜）`
                    : selected.pendingSince
                      ? `${hm(selected.pendingSince)}からの勤務の退勤が押されていません`
                      : "未出勤"}
                </div>
              </div>
              <button onClick={close} className="rounded-full px-4 py-2 text-lg text-slate-500 hover:bg-slate-100">閉じる</button>
            </div>

            {error && <div className="mb-4 rounded-xl bg-red-50 p-3 text-lg font-bold text-red-700">{error}</div>}

            {!pending ? (
              <div className="space-y-3">
                {actionsFor(selected.status).map((type) => (
                  <button
                    key={type}
                    disabled={isPending}
                    onClick={() => choose(type)}
                    className={cx("h-24 w-full rounded-2xl text-3xl font-bold shadow active:scale-[0.99] disabled:opacity-60", ACTION_STYLE[type])}
                  >
                    {LABEL[type]}
                  </button>
                ))}
                {selected.status === "OFF" && selected.pendingSince && (
                  <button
                    disabled={isPending}
                    onClick={() => choose("CLOCK_OUT")}
                    className={cx("h-20 w-full rounded-2xl text-2xl font-bold shadow active:scale-[0.99] disabled:opacity-60", ACTION_STYLE.CLOCK_OUT)}
                  >
                    退勤（{hm(selected.pendingSince)}からの勤務）
                  </button>
                )}
                {selected.status === "OFF" && !selected.pendingSince && (
                  <button disabled={isPending} onClick={() => choose("CLOCK_OUT")} className="w-full py-3 text-slate-500 underline">
                    出勤を押し忘れた → 退勤だけ記録する
                  </button>
                )}
              </div>
            ) : (
              <div>
                <div className="mb-3 text-center text-lg">
                  <b>{LABEL[pending]}</b>：PINを入力してください
                </div>
                <div className="mb-4 flex justify-center gap-3">
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} className={cx("h-5 w-5 rounded-full border-2 border-slate-400", i < pin.length && "bg-slate-800")} />
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "←"].map((k, i) =>
                    k === "" ? (
                      <span key={i} />
                    ) : (
                      <button
                        key={i}
                        disabled={isPending}
                        onClick={() => (k === "←" ? setPin(pin.slice(0, -1)) : pressDigit(k))}
                        className="h-16 rounded-xl bg-slate-100 text-2xl font-bold active:bg-slate-200"
                      >
                        {k}
                      </button>
                    ),
                  )}
                </div>
                <button onClick={() => setPending(null)} className="mt-3 w-full py-2 text-slate-500 underline">戻る</button>
              </div>
            )}
          </div>
        </div>
      )}

      {done && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-6" onClick={() => setDone(null)} role="status">
          <div className={cx("w-full max-w-xl rounded-3xl p-10 text-center shadow-xl", ACTION_STYLE[done.type])}>
            <div className="text-5xl font-bold">{LABEL[done.type]}しました</div>
            <div className="mt-4 text-2xl">{done.message}</div>
          </div>
        </div>
      )}
    </main>
  );
}
