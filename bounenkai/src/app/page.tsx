import { EXTENSION_PRICE, HORS_PRICE, PLANS, TIERS, yen, type Plan } from "@/lib/booking";
import { CATCH_COPY, START_STEP_MIN, STORE, TAX_INCLUDED } from "@/lib/config";
import { CANCEL_NOTES, CANCEL_POLICY, NOTICES, PRICE_NOTE } from "@/lib/policy";
import { seasonAvailability } from "@/server/reservations";
import { Booking } from "./Booking";

export const dynamic = "force-dynamic";

function taxLabel() {
  return TAX_INCLUDED === null ? "" : TAX_INCLUDED ? "（税込）" : "（税別）";
}

export default async function Home() {
  const season = await seasonAvailability();
  return (
    <div className="felt min-h-dvh pb-36">
      <header className="sticky top-0 z-30 border-b border-line/80 bg-ink/90 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-3">
          <a href="#top" className="font-serif text-2xl font-bold tracking-[0.2em] gold-text">
            9HIGH
          </a>
          {STORE.phone && (
            <a
              href={`tel:${STORE.phone}`}
              aria-label="電話する"
              className="grid size-10 place-items-center rounded-full border border-gold/70 text-gold"
            >
              <PhoneIcon />
            </a>
          )}
        </div>
      </header>

      <main id="top" className="mx-auto max-w-xl px-4">
        {/* ヒーロー */}
        <section className="relative overflow-hidden pt-10 pb-8">
          <Cards />
          <p className="relative text-sm tracking-[0.18em] text-gold">Poker Bar {STORE.name}</p>
          <h1 className="relative z-10 mt-4 text-[2.1rem] leading-tight font-black">
            {/* 「、」のあとで改行する */}
            {CATCH_COPY.text.split(/(?<=、)/).map((line) => (
              <span key={line} className="gold-text block">
                {line}
              </span>
            ))}
          </h1>
          <p className="mt-3 text-lg font-bold text-white/90">カジノ体験型の貸し切り忘年会</p>
          <ul className="mt-5 flex flex-wrap gap-2 text-sm">
            {["8〜30名様", "2時間飲み放題", "ディーラー付きポーカー", "11月・12月 毎日受付"].map((t) => (
              <li key={t} className="rounded-full border border-line px-3.5 py-1.5 text-white/90">
                {t}
              </li>
            ))}
          </ul>
          <a href="#booking" className="gold-btn mt-7 inline-flex rounded-2xl px-6 py-3.5 font-bold">
            空き日程を見て予約する
          </a>
        </section>

        {/* プラン */}
        <section id="plans" className="space-y-4 py-6">
          <SectionTitle en="PLANS" ja="プランと料金" />
          {(Object.keys(PLANS) as Plan[]).map((p) => (
            <div key={p} className={`rounded-3xl border p-5 ${p === "casino" ? "border-gold/70 bg-gradient-to-b from-[#2a2414] to-panel" : "border-line bg-panel"}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  {p === "casino" && <p className="mb-1 text-xs font-bold tracking-widest text-gold">FULL CASINO</p>}
                  <h3 className="text-xl font-bold">{PLANS[p].name}</h3>
                  <p className="mt-1 text-sm text-muted">{PLANS[p].desc}</p>
                </div>
              </div>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {PLANS[p].games.map((g) => (
                  <li key={g} className="rounded-md bg-white/5 px-2 py-1 text-xs text-white/85">
                    {g}
                  </li>
                ))}
                <li className="rounded-md bg-white/5 px-2 py-1 text-xs text-white/85">2時間飲み放題</li>
              </ul>
              <table className="mt-4 w-full text-sm">
                <tbody>
                  {TIERS.map((t) => (
                    <tr key={t.min} className="border-t border-white/5">
                      <td className="py-2 text-muted">
                        {t.min}〜{t.max}名
                      </td>
                      <td className="py-2 text-right text-base font-bold text-gold2">
                        {yen(t.price[p])}
                        <span className="text-xs font-normal text-muted"> /人{taxLabel()}</span>
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-white/5">
                    <td className="py-2 text-muted">延長（1時間）</td>
                    <td className="py-2 text-right font-bold text-white/90">
                      {yen(EXTENSION_PRICE[p])}
                      <span className="text-xs font-normal text-muted"> /人</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ))}
          <div className="rounded-2xl border border-line bg-panel p-4 text-sm leading-relaxed text-white/85">
            <p>
              <b className="text-gold2">オードブル</b>（つまみやすい盛り合わせ）：1人あたり +{yen(HORS_PRICE)}
              <span className="text-muted">（つける場合はグループ全員分）</span>
            </p>
            <p className="mt-2 text-muted">延長料金は人数割引の対象外です。{PRICE_NOTE}</p>
            {TAX_INCLUDED === null && <p className="mt-2 text-xs text-muted">※ 税込・税別の表示は確認中です。</p>}
          </div>
        </section>

        {/* 予約フォーム */}
        <section id="booking" className="scroll-mt-20 py-6">
          <SectionTitle en="RESERVATION" ja="ご予約" />
          <Booking season={season} step={START_STEP_MIN} />
        </section>

        {/* 注意事項・キャンセル規定 */}
        <section id="notice" className="space-y-4 py-6">
          <SectionTitle en="NOTICE" ja="ご利用にあたって" />
          <ul className="space-y-2 rounded-2xl border border-line bg-panel p-5 text-sm leading-relaxed">
            {NOTICES.map((n, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-gold">♠</span>
                {n.text ? <span>{n.text}</span> : <span className="text-muted">{n.pending}</span>}
              </li>
            ))}
          </ul>
          <div className="rounded-2xl border border-line bg-panel p-5">
            <h3 className="mb-3 font-bold">キャンセル規定</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted">
                  <th className="pb-2 text-left font-normal">項目</th>
                  <th className="pb-2 text-right font-normal">前日</th>
                  <th className="pb-2 text-right font-normal">当日</th>
                </tr>
              </thead>
              <tbody>
                {CANCEL_POLICY.map((c) => (
                  <tr key={c.item} className="border-t border-white/5">
                    <td className="py-2">{c.item}</td>
                    <td className="py-2 text-right">{c.dayBefore}</td>
                    <td className="py-2 text-right">{c.sameDay}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {CANCEL_NOTES.map((n) => (
              <p key={n} className="mt-3 text-sm text-muted">
                ※ {n}
              </p>
            ))}
          </div>
        </section>

        <footer className="border-t border-line py-8 text-sm text-muted">
          <p className="font-serif text-lg tracking-[0.2em] gold-text">9HIGH</p>
          <p className="mt-2 text-white/85">
            {STORE.name}（{STORE.kind}）
          </p>
          {STORE.address && <p>{STORE.address}</p>}
          {STORE.phone && <p>TEL {STORE.phone}</p>}
          {STORE.mapUrl && (
            <a href={STORE.mapUrl} className="text-gold underline" target="_blank" rel="noreferrer">
              地図を見る
            </a>
          )}
          <p className="mt-1">営業：0:00閉店</p>
          <p className="mt-3 text-xs">運営：{STORE.company}</p>
        </footer>
      </main>
    </div>
  );
}

function SectionTitle({ en, ja }: { en: string; ja: string }) {
  return (
    <div className="mb-2">
      <p className="font-serif text-xs tracking-[0.3em] text-gold">{en}</p>
      <h2 className="text-2xl font-bold">{ja}</h2>
    </div>
  );
}

function Cards() {
  // 右上のトランプ・チップの飾り
  return (
    <div aria-hidden className="pointer-events-none absolute -top-4 -right-10 h-36 w-48 scale-75 opacity-80">
      {[
        { s: "A", suit: "♠", r: "-14deg", x: 18, c: "text-ink" },
        { s: "K", suit: "♥", r: "4deg", x: 70, c: "text-chip" },
        { s: "Q", suit: "♣", r: "18deg", x: 118, c: "text-ink" },
      ].map((c) => (
        <div
          key={c.s}
          className="float-card absolute top-2 h-24 w-16 rounded-lg border border-black/20 bg-[#f4efe4] shadow-xl shadow-black/60"
          style={{ left: c.x, ["--r" as string]: c.r, transform: `rotate(${c.r})` }}
        >
          <span className={`absolute top-1 left-1.5 text-sm font-bold ${c.c}`}>{c.s}</span>
          <span className={`absolute right-1.5 bottom-1 text-xl ${c.c}`}>{c.suit}</span>
        </div>
      ))}
    </div>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
      <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" />
    </svg>
  );
}
