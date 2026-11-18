"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  coursePrice,
  endMin,
  extensionLabel,
  fmtDate,
  fmtMin,
  GROUP_TYPES,
  HORS_PRICE,
  EXTENSION_PRICE,
  MAX_PEOPLE,
  MIN_PEOPLE,
  PLANS,
  quote,
  TIERS,
  yen,
  type GroupType,
  type Plan,
  type SlotInfo,
} from "@/lib/booking";
import { STORE, TAX_INCLUDED } from "@/lib/config";
import { isValidEmail, isValidPhone } from "@/lib/validate";
import { CANCEL_NOTES, CANCEL_POLICY, PRICE_NOTE } from "@/lib/policy";

type DayStatus = "open" | "few" | "full" | "closed";
interface Season {
  months: { year: number; month: number }[];
  days: Record<string, DayStatus>;
}

const WD = ["日", "月", "火", "水", "木", "金", "土"];
const MARK: Record<DayStatus, string> = { open: "◯", few: "△", full: "×", closed: "－" };

function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}
const tax = TAX_INCLUDED === null ? "" : TAX_INCLUDED ? "（税込）" : "（税別）";

export function Booking({ season: initialSeason, step }: { season: Season; step: number }) {
  const [season, setSeason] = useState(initialSeason);
  const firstOpenMonth = Math.max(
    0,
    initialSeason.months.findIndex(({ year, month }) =>
      Object.entries(initialSeason.days).some(([d, s]) => d.startsWith(`${year}-${String(month).padStart(2, "0")}`) && s !== "closed"),
    ),
  );
  const [monthIdx, setMonthIdx] = useState(firstOpenMonth);
  const [date, setDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<SlotInfo[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [startMin, setStartMin] = useState<number | null>(null);
  const [groupType, setGroupType] = useState<GroupType | null>(null);
  const [people, setPeople] = useState(10);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [ext, setExt] = useState(0);
  const [hors, setHors] = useState<boolean | null>(null);
  const [rep, setRep] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // ボット対策（人には見えない）
  const [showErrors, setShowErrors] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [mailSent, setMailSent] = useState(true);

  const refs = {
    date: useRef<HTMLDivElement>(null),
    time: useRef<HTMLDivElement>(null),
    people: useRef<HTMLDivElement>(null),
    plan: useRef<HTMLDivElement>(null),
    options: useRef<HTMLDivElement>(null),
    info: useRef<HTMLDivElement>(null),
  };

  async function loadDay(d: string) {
    setSlotsLoading(true);
    try {
      const res = await fetch(`/api/availability?date=${d}`, { cache: "no-store" });
      const body = (await res.json()) as { slots: SlotInfo[] };
      setSlots(body.slots);
      return body.slots;
    } catch {
      setSlots([]);
      return [];
    } finally {
      setSlotsLoading(false);
    }
  }

  async function refreshSeason() {
    try {
      const res = await fetch("/api/availability", { cache: "no-store" });
      setSeason(await res.json());
    } catch {
      /* 表示はそのまま */
    }
  }

  function pickDate(d: string) {
    setDate(d);
    setStartMin(null);
    setSlots(null);
    void loadDay(d);
    setTimeout(() => refs.time.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  // 予約完了後は完了画面の先頭へ
  useEffect(() => {
    if (done !== null) document.getElementById("booking")?.scrollIntoView({ block: "start" });
  }, [done]);

  const slot = slots?.find((s) => s.startMin === startMin) ?? null;
  const maxExt = slot?.available ? slot.maxExtension : 0;
  useEffect(() => {
    if (ext > maxExt) setExt(maxExt);
  }, [ext, maxExt]);

  const q = plan && quote({ plan, people, extensionHours: Math.min(ext, maxExt), hors: hors ?? false });

  const emailOk = isValidEmail(email);
  const phoneOk = isValidPhone(phone);
  const missing = useMemo(() => {
    const m: { key: keyof typeof refs; label: string }[] = [];
    if (!date) m.push({ key: "date", label: "日程を選ぶ" });
    else if (startMin === null) m.push({ key: "time", label: "時間を選ぶ" });
    if (!groupType) m.push({ key: "people", label: "ご利用の種類" });
    if (!plan) m.push({ key: "plan", label: "プランを選ぶ" });
    if (hors === null) m.push({ key: "options", label: "オードブル" });
    if (!rep.trim() || (groupType === "company" && !company.trim()) || !phoneOk || !emailOk) m.push({ key: "info", label: "お客様情報" });
    return m;
  }, [date, startMin, groupType, plan, hors, rep, company, phoneOk, emailOk]);

  function next() {
    if (missing.length > 0) {
      setShowErrors(true);
      refs[missing[0].key].current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setSendError(null);
    setConfirming(true);
  }

  async function submit() {
    if (!date || startMin === null || !groupType || !plan || hors === null) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupType,
          representative: rep,
          companyName: groupType === "company" ? company : "",
          people,
          phone,
          email,
          date,
          startMin,
          plan,
          extensionHours: Math.min(ext, maxExt),
          hors,
          website,
        }),
      });
      const body = (await res.json()) as { ok: boolean; code?: string; error?: string; mailSent?: boolean };
      if (!body.ok) {
        setSendError(body.error ?? "送信に失敗しました");
        // 枠が埋まった場合などに備えて空きを読み直す
        await Promise.all([loadDay(date), refreshSeason()]);
        return;
      }
      setMailSent(body.mailSent === true);
      setDone(body.code ?? "");
      setConfirming(false);
    } catch {
      setSendError("通信できませんでした。電波の良いところでもう一度お試しください");
    } finally {
      setSending(false);
    }
  }

  const summary: [string, string][] = [
    ["利用日", date ? fmtDate(date) : "—"],
    ["時間", startMin !== null ? `${fmtMin(startMin)}〜${fmtMin(endMin(startMin, Math.min(ext, maxExt)))}` : "—"],
    ["プラン", plan ? PLANS[plan].name : "—"],
    ["人数", `${people}名`],
    ["延長", extensionLabel(Math.min(ext, maxExt))],
    ["オードブル", hors === null ? "—" : hors ? "あり" : "なし"],
    ["利用の種類", groupType ? GROUP_TYPES[groupType] : "—"],
    ["代表者名", rep || "—"],
    ...(groupType === "company" ? ([["会社名・団体名", company || "—"]] as [string, string][]) : []),
    ["電話番号", phone || "—"],
    ["メールアドレス", email || "—"],
  ];

  if (done !== null) {
    return (
      <div className="rounded-3xl border border-gold/60 bg-panel p-6 text-center">
        <p className="text-4xl">🎉</p>
        <h3 className="mt-3 text-xl font-bold">ご予約を受け付けました</h3>
        <p className="mt-2 text-sm text-muted">受付番号</p>
        <p className="font-serif text-3xl tracking-[0.2em] text-gold2">{done}</p>
        <p className="mt-4 text-sm leading-relaxed text-white/85">
          {mailSent ? (
            <>
              ご入力のメールアドレスに確認メールをお送りしました。
              <br />
              届かない場合は、お手数ですがお店までご連絡ください。
            </>
          ) : (
            <>
              ただいま確認メールをお送りできませんでした（ご予約は受け付けています）。
              <br />
              この画面を保存するか、受付番号を控えておいてください。
            </>
          )}
          {STORE.phone && (
            <>
              <br />
              TEL <a href={`tel:${STORE.phone}`} className="text-gold underline">{STORE.phone}</a>
            </>
          )}
        </p>
        <dl className="mt-5 space-y-1.5 text-left text-sm">
          {summary.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-b border-white/5 pb-1.5">
              <dt className="text-muted">{k}</dt>
              <dd className="text-right break-all">{v}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-4 pt-1">
            <dt className="text-muted">合計金額の目安</dt>
            <dd className="font-bold text-gold2">{q ? yen(q.total) : "—"}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted">{PRICE_NOTE}</p>
      </div>
    );
  }

  const ym = season.months[monthIdx];
  const first = new Date(Date.UTC(ym.year, ym.month - 1, 1)).getUTCDay();
  const last = new Date(Date.UTC(ym.year, ym.month, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(first).fill(null)];
  for (let d = 1; d <= last; d++) cells.push(`${ym.year}-${String(ym.month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);

  const curTier = TIERS.findIndex((t) => people >= t.min && people <= t.max);
  const nextTier = TIERS[curTier + 1];
  const shownPlan: Plan = plan ?? "basic";

  return (
    <div className="space-y-5">
      {/* ① 日程 */}
      <Step n={1} title="日程" refEl={refs.date} error={showErrors && !date ? "日付を選んでください" : null}>
        <div className="flex items-center justify-between">
          <button
            type="button"
            aria-label="前の月"
            disabled={monthIdx === 0}
            onClick={() => setMonthIdx(monthIdx - 1)}
            className="grid size-11 place-items-center rounded-full border border-line text-xl disabled:opacity-25"
          >
            ‹
          </button>
          <p className="font-serif text-xl font-bold">
            {ym.year}年{ym.month}月
          </p>
          <button
            type="button"
            aria-label="次の月"
            disabled={monthIdx === season.months.length - 1}
            onClick={() => setMonthIdx(monthIdx + 1)}
            className="grid size-11 place-items-center rounded-full border border-line text-xl disabled:opacity-25"
          >
            ›
          </button>
        </div>
        <div className="mt-4 grid grid-cols-7 gap-1.5 text-center">
          {WD.map((w, i) => (
            <div key={w} className={cx("pb-1 text-xs", i === 0 ? "text-rose-400" : i === 6 ? "text-sky-400" : "text-muted")}>
              {w}
            </div>
          ))}
          {cells.map((d, i) => {
            if (!d) return <div key={`e${i}`} />;
            const st = season.days[d] ?? "closed";
            const ok = st === "open" || st === "few";
            const wd = i % 7;
            const sel = d === date;
            return (
              <button
                type="button"
                key={d}
                disabled={!ok}
                onClick={() => pickDate(d)}
                aria-label={`${fmtDate(d)} ${st === "open" ? "空きあり" : st === "few" ? "残りわずか" : st === "full" ? "満席" : "受付外"}`}
                aria-pressed={sel}
                className={cx(
                  "flex aspect-square flex-col items-center justify-center rounded-xl border text-sm transition",
                  sel ? "gold-btn border-transparent" : ok ? "border-white/10 bg-panel2 active:scale-95" : "border-transparent bg-white/[0.02] text-white/25",
                )}
              >
                <span className={cx("font-bold", !sel && ok && (wd === 0 ? "text-rose-400" : wd === 6 ? "text-sky-400" : ""))}>{Number(d.slice(8))}</span>
                <span className={cx("text-[11px] leading-none", sel ? "" : st === "few" ? "text-amber-400" : ok ? "text-gold" : "")}>{MARK[st]}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted">◯ 空きあり　△ 残り1組　× 満席　－ 受付外（ご予約は利用日の2日前まで）</p>

        <div ref={refs.time} className="scroll-mt-24">
          {!date ? (
            <p className="mt-6 text-center text-muted">カレンダーから日付を選んでください</p>
          ) : (
            <div className="mt-6">
              <p className="mb-2 font-bold">
                {fmtDate(date)} のスタート時間
                {showErrors && startMin === null && <span className="ml-2 text-sm font-normal text-rose-400">選んでください</span>}
              </p>
              {slotsLoading || !slots ? (
                <p className="py-4 text-center text-sm text-muted">空き状況を確認しています…</p>
              ) : (
                <>
                  <div className="grid grid-cols-4 gap-2">
                    {slots.map((s) => (
                      <button
                        type="button"
                        key={s.startMin}
                        disabled={!s.available}
                        onClick={() => setStartMin(s.startMin)}
                        aria-pressed={s.startMin === startMin}
                        className={cx(
                          "rounded-xl border py-2.5 text-sm font-bold",
                          s.startMin === startMin
                            ? "gold-btn border-transparent"
                            : s.available
                              ? "border-white/10 bg-panel2"
                              : "border-transparent bg-white/[0.02] text-white/25 line-through",
                        )}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    2時間制・{step}分刻み。0:00閉店のため、遅い時間のスタートは延長できる時間が短くなります。
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </Step>

      {/* ② 人数・ご利用 */}
      <Step n={2} title="人数・ご利用の種類" refEl={refs.people} error={showErrors && !groupType ? "ご利用の種類を選んでください" : null}>
        <p className="mb-2 text-sm text-muted">ご利用の種類</p>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(GROUP_TYPES) as GroupType[]).map((g) => (
            <Choice key={g} selected={groupType === g} onClick={() => setGroupType(g)}>
              {GROUP_TYPES[g]}
            </Choice>
          ))}
        </div>

        <p className="mt-6 mb-2 text-sm text-muted">参加人数（{MIN_PEOPLE}〜{MAX_PEOPLE}名）</p>
        <div className="flex items-center justify-between rounded-full border border-line bg-panel2 px-2 py-2">
          <button
            type="button"
            aria-label="1名減らす"
            disabled={people <= MIN_PEOPLE}
            onClick={() => setPeople(people - 1)}
            className="grid size-12 place-items-center rounded-full text-3xl text-gold disabled:opacity-25"
          >
            −
          </button>
          <p className="font-serif text-4xl font-bold text-gold2" aria-live="polite">
            {people}
            <span className="ml-1 font-sans text-base text-muted">名</span>
          </p>
          <button
            type="button"
            aria-label="1名増やす"
            disabled={people >= MAX_PEOPLE}
            onClick={() => setPeople(people + 1)}
            className="grid size-12 place-items-center rounded-full text-3xl text-gold disabled:opacity-25"
          >
            ＋
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {[8, 10, 15, 20, 25, 30].map((n) => (
            <button
              type="button"
              key={n}
              onClick={() => setPeople(n)}
              className={cx("rounded-full border px-4 py-1.5 text-sm", n === people ? "border-gold text-gold" : "border-line text-white/85")}
            >
              {n}名
            </button>
          ))}
        </div>

        {/* 人数割引メーター */}
        <div className="mt-5 rounded-2xl border border-line bg-black/20 p-4">
          <p className="text-sm text-muted">人数割引メーター（{PLANS[shownPlan].name}・1人あたり）</p>
          <div className="relative mt-4 h-2 rounded-full bg-white/10">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#b98d2c] to-gold2"
              style={{ width: `${((people - MIN_PEOPLE) / (MAX_PEOPLE - MIN_PEOPLE)) * 100}%` }}
            />
            {TIERS.slice(1).map((t) => (
              <div
                key={t.min}
                className={cx("absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2", people >= t.min ? "border-gold2 bg-gold" : "border-white/30 bg-panel")}
                style={{ left: `${((t.min - MIN_PEOPLE) / (MAX_PEOPLE - MIN_PEOPLE)) * 100}%` }}
              />
            ))}
          </div>
          <div className="relative mt-2 h-9 text-[11px] text-muted">
            {TIERS.map((t, i) => (
              <div
                key={t.min}
                className={cx("absolute text-center", i === 0 ? "left-0" : "-translate-x-1/2", curTier === i && "text-gold2")}
                style={i === 0 ? undefined : { left: `${((t.min - MIN_PEOPLE) / (MAX_PEOPLE - MIN_PEOPLE)) * 100}%` }}
              >
                {t.min}名〜
                <br />
                {yen(t.price[shownPlan])}
              </div>
            ))}
          </div>
          <p className="mt-1 text-sm">
            {nextTier ? (
              <>
                あと<b className="text-gold2">{nextTier.min - people}名</b>で、1人あたり
                <b className="text-gold2">{yen(nextTier.price[shownPlan])}</b>になります
              </>
            ) : (
              <span className="text-gold2">いちばんお得な料金です</span>
            )}
          </p>
        </div>
      </Step>

      {/* ③ プラン */}
      <Step n={3} title="プラン" refEl={refs.plan} error={showErrors && !plan ? "プランを選んでください" : null}>
        <div className="space-y-2.5">
          {(Object.keys(PLANS) as Plan[]).map((p) => (
            <Option
              key={p}
              selected={plan === p}
              onClick={() => setPlan(p)}
              title={PLANS[p].name}
              desc={PLANS[p].desc}
              price={`${yen(coursePrice(p, people) ?? 0)}/人`}
            />
          ))}
        </div>
      </Step>

      {/* ④ 延長・オードブル */}
      <Step n={4} title="延長・オードブル" refEl={refs.options} error={showErrors && hors === null ? "オードブルの有無を選んでください" : null}>
        <p className="mb-2 text-sm text-muted">延長（1時間あたり {yen(EXTENSION_PRICE[shownPlan])}/人・人数割引なし）</p>
        {startMin === null ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-3 text-sm text-muted">スタート時間を選ぶと、延長できる時間が出ます</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: maxExt + 1 }, (_, h) => (
                <Choice key={h} selected={Math.min(ext, maxExt) === h} onClick={() => setExt(h)}>
                  {extensionLabel(h)}
                </Choice>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">
              {fmtMin(startMin)}スタートの延長は最大{maxExt}時間です（0:00閉店・後ろのご予約との間隔から計算）。
              当日の延長は、後ろにご予約が入っていない場合のみ承ります。
            </p>
          </>
        )}

        <p className="mt-6 mb-2 text-sm text-muted">オードブル</p>
        <div className="space-y-2.5">
          <Option selected={hors === false} onClick={() => setHors(false)} title="なし" desc="飲み放題とゲームのみ" price="—" />
          <Option
            selected={hors === true}
            onClick={() => setHors(true)}
            title="オードブル付き"
            desc="つまみやすい盛り合わせ（グループ全員分）"
            price={`+${yen(HORS_PRICE)}/人`}
          />
        </div>
      </Step>

      {/* ⑤ お客様情報 */}
      <Step n={5} title="お客様情報" refEl={refs.info}>
        <div className="space-y-4">
          <TextField label="代表者名" value={rep} onChange={setRep} autoComplete="name" error={showErrors && !rep.trim() ? "入力してください" : null} />
          {groupType === "company" && (
            <TextField
              label="会社名・団体名"
              value={company}
              onChange={setCompany}
              autoComplete="organization"
              error={showErrors && !company.trim() ? "入力してください" : null}
            />
          )}
          <TextField
            label="電話番号"
            value={phone}
            onChange={setPhone}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="090-1234-5678"
            error={showErrors && !phoneOk ? "正しく入力してください" : null}
          />
          <TextField
            label="メールアドレス"
            value={email}
            onChange={setEmail}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="example@mail.com"
            error={showErrors && !emailOk ? "正しく入力してください" : null}
          />
          <input
            tabIndex={-1}
            aria-hidden
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            className="absolute -left-[9999px] h-0 w-0 opacity-0"
            name="website"
          />
        </div>
      </Step>

      {/* お見積もり */}
      <section className="rounded-3xl border border-line bg-panel p-5">
        <h3 className="text-xl font-bold">お見積もり</h3>
        <p className="mt-1 text-sm text-muted">
          {plan ? PLANS[plan].name : "プラン未選択"}・{people}名・延長{extensionLabel(Math.min(ext, maxExt))}
        </p>
        <div className="mt-4 rounded-2xl border border-gold/30 bg-gradient-to-b from-[#221d10] to-black/40 p-5 text-center">
          <p className="text-sm text-muted">合計金額の目安{tax}</p>
          <p className="font-serif text-5xl font-bold text-gold2">
            {q ? q.total.toLocaleString("ja-JP") : "—"}
            <span className="ml-1 font-sans text-xl">円</span>
          </p>
          <p className="mt-1 text-sm text-white/80">{q ? `1人あたり ${yen(q.perPerson)}` : "プランを選ぶと表示します"}</p>
        </div>
        <p className="mt-3 rounded-xl border border-dashed border-gold/40 bg-gold/5 px-3 py-2 text-sm text-gold2">
          料金は当日の人数で計算し直します。
        </p>
        {q && (
          <dl className="mt-4 space-y-2 text-sm">
            <Row k={`コース料金（${yen(q.coursePerPerson)} × ${people}名）`} v={yen(q.course)} />
            {q.extension > 0 && <Row k={`延長（${yen(q.extensionPerPerson)} × ${people}名）`} v={yen(q.extension)} />}
            {q.hors > 0 && <Row k={`オードブル（${yen(q.horsPerPerson)} × ${people}名）`} v={yen(q.hors)} />}
            <div className="flex justify-between border-t border-white/10 pt-2 text-base font-bold">
              <dt>合計</dt>
              <dd className="text-gold2">{yen(q.total)}</dd>
            </div>
          </dl>
        )}
        <p className="mt-3 text-xs leading-relaxed text-muted">{PRICE_NOTE} お支払いは当日、現金でお願いします。</p>
        <button type="button" onClick={next} className="gold-btn mt-5 w-full rounded-2xl py-4 text-lg font-bold">
          入力内容を確認する
        </button>
        {showErrors && missing.length > 0 && <p className="mt-2 text-center text-sm text-rose-400">未入力の項目があります：{missing.map((m) => m.label).join("・")}</p>}
      </section>

      {/* 下に固定の合計バー */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ink/95 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs text-muted">合計金額の目安{tax}</p>
            <p className="text-2xl leading-tight font-bold text-gold2">{q ? yen(q.total) : "—"}</p>
            <p className="text-xs text-muted">{q ? `1人あたり ${yen(q.perPerson)}・当日の人数で再計算` : "プランを選ぶと表示します"}</p>
          </div>
          <button type="button" onClick={next} className="gold-btn shrink-0 rounded-2xl px-5 py-3.5 font-bold">
            {missing[0]?.label ?? "確認へ"}
          </button>
        </div>
      </div>

      {/* 確認画面 */}
      {confirming && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="mx-auto min-h-full max-w-xl px-4 py-6">
            <div className="rounded-3xl border border-gold/50 bg-panel p-5">
              <h3 id="confirm-title" className="text-xl font-bold">
                ご予約内容の確認
              </h3>
              <p className="mt-1 text-sm text-muted">内容をご確認のうえ「予約を確定する」を押してください。</p>
              <dl className="mt-4 space-y-2 text-sm">
                {summary.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 border-b border-white/5 pb-2">
                    <dt className="shrink-0 text-muted">{k}</dt>
                    <dd className="text-right break-all">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 rounded-2xl bg-black/30 p-4 text-center">
                <p className="text-sm text-muted">合計金額の目安{tax}</p>
                <p className="text-3xl font-bold text-gold2">{q ? yen(q.total) : "—"}</p>
                <p className="text-xs text-muted">1人あたり {q ? yen(q.perPerson) : "—"}</p>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted">{PRICE_NOTE}</p>
              <div className="mt-4 rounded-2xl border border-line p-4 text-xs leading-relaxed text-white/80">
                <p className="mb-1 font-bold">キャンセル規定</p>
                {CANCEL_POLICY.map((c) => (
                  <p key={c.item}>
                    ・{c.item}：{c.dayBefore === "なし" ? "キャンセル料なし" : `前日 ${c.dayBefore}／当日 ${c.sameDay}`}
                  </p>
                ))}
                {CANCEL_NOTES.map((n) => (
                  <p key={n}>・{n}</p>
                ))}
              </div>
              {sendError && <p className="mt-4 rounded-xl border border-rose-500/50 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">{sendError}</p>}
              <button type="button" disabled={sending} onClick={submit} className="gold-btn mt-5 w-full rounded-2xl py-4 text-lg font-bold">
                {sending ? "送信中…" : "予約を確定する"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  if (sendError) {
                    const inInfo = /電話|メール|代表者|会社/.test(sendError);
                    (inInfo ? refs.info : refs.time).current?.scrollIntoView({ block: "start" });
                  }
                }}
                className="mt-2 w-full rounded-2xl py-3 text-sm text-muted"
              >
                修正する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Step({
  n,
  title,
  children,
  refEl,
  error,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
  refEl: React.RefObject<HTMLDivElement | null>;
  error?: string | null;
}) {
  return (
    <section ref={refEl} className="scroll-mt-20 rounded-3xl border border-line bg-panel p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="chip-num grid size-10 shrink-0 place-items-center rounded-full">
          <span className="grid size-6 place-items-center rounded-full text-sm font-bold text-white">{n}</span>
        </span>
        <h3 className="text-xl font-bold">{title}</h3>
        {error && <span className="ml-auto text-sm text-rose-400">{error}</span>}
      </div>
      {children}
    </section>
  );
}

function Choice({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cx("rounded-full border px-3 py-2.5 text-sm font-bold transition", selected ? "gold-btn border-transparent" : "border-line bg-panel2 text-white/90")}
    >
      {children}
    </button>
  );
}

function Option({ selected, onClick, title, desc, price }: { selected: boolean; onClick: () => void; title: string; desc: string; price: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cx(
        "flex w-full items-center justify-between gap-3 rounded-2xl border p-4 text-left transition",
        selected ? "border-gold bg-gold/10" : "border-white/10 bg-panel2",
      )}
    >
      <span>
        <span className="block text-lg font-bold">{title}</span>
        <span className="mt-0.5 block text-sm text-muted">{desc}</span>
      </span>
      <span className={cx("shrink-0 font-bold", selected ? "text-gold2" : "text-gold")}>{price}</span>
    </button>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  error,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-2 text-sm text-muted">
        {label}
        <span className="rounded bg-chip px-1.5 py-0.5 text-[10px] font-bold text-white">必須</span>
        {error && <span className="ml-auto text-rose-400">{error}</span>}
      </span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cx(
          "w-full rounded-xl border bg-panel2 px-4 py-3 text-base text-white outline-none placeholder:text-white/25 focus:border-gold",
          error ? "border-rose-500" : "border-white/10",
        )}
      />
    </label>
  );
}
