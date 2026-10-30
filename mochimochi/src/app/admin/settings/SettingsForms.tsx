"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { saveAssetAction, saveBrandAction, saveNumbersAction, savePlacePointsAction, saveRanksAction } from "./actions";

type Res = { ok: true; message?: string } | { ok: false; error: string };
type Numbers = {
  dayChangeHour: number;
  checkinPoints: number;
  stampsPerCard: number;
  stampCardBonus: number;
  jankenWinPoints: number;
  chinchiroWinPoints: number;
  chinchiroBigWinPoints: number;
  mochiWinOdds: number;
  mochiWinPoints: number;
  mochiDailyWinLimit: number;
  guestSignupEnabled: boolean;
  geoEnabled: boolean;
  geoLat: number | null;
  geoLng: number | null;
  geoRadiusM: number;
};
type Brand = { storeName: string; storeSubName: string; pointName: string; mochiLabel: string; mochiWord: string; logoUrl: string; hasLogo: boolean; soundUrl: string | null };
type Rank = { name: string; minVisits: number; color: string };

function useRunner() {
  const router = useRouter();
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(p: Promise<Res>) {
    setBusy(true);
    const res = await p;
    setBusy(false);
    setMsg(res.ok ? { kind: "success", text: res.message ?? "保存しました" } : { kind: "error", text: res.error });
    if (res.ok) router.refresh();
  }
  const banner = msg && <Alert kind={msg.kind}>{msg.text}</Alert>;
  return { run, busy, banner };
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export function SettingsForms({
  brand,
  numbers,
  ranks,
  placePoints,
  lineEnabled,
}: {
  brand: Brand;
  numbers: Numbers;
  ranks: Rank[];
  placePoints: { darts: number[]; poker: number[] };
  lineEnabled: boolean;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <BrandForm brand={brand} />
      <NumbersForm numbers={numbers} lineEnabled={lineEnabled} />
      <RanksForm initial={ranks} />
      <PlacePointsForm initial={placePoints} />
    </div>
  );
}

function BrandForm({ brand }: { brand: Brand }) {
  const { run, busy, banner } = useRunner();
  async function upload(kind: "logo" | "sound", file: File | undefined) {
    if (!file) return;
    if (file.size > 1024 * 1024) return alert("1MBまでのファイルにしてください");
    await run(saveAssetAction(kind, await readFile(file)));
  }
  return (
    <Card title="見た目（ロゴ・店名）" className="lg:col-span-2">
      <div className="space-y-4">
        {banner}
        <p className="text-sm text-slate-600">画面上部・アイコンに出るロゴと店名です。ロゴを変えたいときは画像をアップロードしてください（お客さんの画面・管理画面に反映されます）。トラなどのイラストは public/brand/ の画像です（README 参照）。</p>
        <div className="grid gap-4 md:grid-cols-[160px_1fr]">
          <div className="text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={brand.logoUrl} alt="ロゴ" className="mx-auto h-32 w-32 rounded-full border border-slate-200 bg-white object-contain" />
            <div className="mt-1 text-xs text-slate-500">{brand.hasLogo ? "アップロード済み" : "標準ロゴ"}</div>
            <label className="mt-2 inline-block cursor-pointer rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
              画像を選ぶ
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => upload("logo", e.target.files?.[0])} />
            </label>
            {brand.hasLogo && (
              <button className="mt-1 block w-full text-xs text-slate-400 underline" onClick={() => confirm("標準ロゴに戻しますか？") && run(saveAssetAction("logo", null))}>
                標準ロゴに戻す
              </button>
            )}
            <p className="mt-1 text-[11px] text-slate-400">PNG/JPEG/WebP・1MBまで。正方形がきれいに出ます</p>
          </div>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              const f = Object.fromEntries(new FormData(e.currentTarget));
              void run(saveBrandAction(f));
            }}
          >
            <Field label="店名">
              <Input name="storeName" defaultValue={brand.storeName} required maxLength={40} />
            </Field>
            <Field label="店名の下の小さい文字" hint="読み・英字・キャッチコピーなど（空でもOK）">
              <Input name="storeSubName" defaultValue={brand.storeSubName} maxLength={60} />
            </Field>
            <Field label="ポイントの名前">
              <Input name="pointName" defaultValue={brand.pointName} required maxLength={20} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="連打ボタンの文字">
                <Input name="mochiLabel" defaultValue={brand.mochiLabel} required maxLength={10} />
              </Field>
              <Field label="鳴らす言葉">
                <Input name="mochiWord" defaultValue={brand.mochiWord} required maxLength={10} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Button disabled={busy}>表示を保存</Button>
            </div>
          </form>
        </div>
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <div className="font-bold">「{brand.mochiWord}」の音声</div>
          <p className="text-xs text-slate-600">
            {brand.soundUrl ? "アップロードした音声を鳴らしています。" : "いまは端末の読み上げ機能で鳴らしています。声を録音したファイル（mp3/m4a/wav・1MBまで）をアップロードすると差し替わります。"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">
              音声を選ぶ
              <input type="file" accept="audio/*" className="hidden" onChange={(e) => upload("sound", e.target.files?.[0])} />
            </label>
            {brand.soundUrl && (
              <>
                <audio src={brand.soundUrl} controls className="h-8" />
                <button className="text-xs text-slate-400 underline" onClick={() => confirm("読み上げに戻しますか？") && run(saveAssetAction("sound", null))}>
                  読み上げに戻す
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function NumField({ name, label, value, hint, step }: { name: string; label: string; value: number | null; hint?: ReactNode; step?: string }) {
  return (
    <Field label={label} hint={hint}>
      <Input name={name} type="number" step={step ?? "1"} defaultValue={value ?? ""} inputMode="decimal" />
    </Field>
  );
}

function NumbersForm({ numbers: n, lineEnabled }: { numbers: Numbers; lineEnabled: boolean }) {
  const { run, busy, banner } = useRunner();
  const [geoEnabled, setGeoEnabled] = useState(n.geoEnabled);
  const [lat, setLat] = useState(n.geoLat?.toString() ?? "");
  const [lng, setLng] = useState(n.geoLng?.toString() ?? "");

  return (
    <Card title="ポイント・ゲーム" className="lg:col-span-2">
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const num = (k: string) => f.get(k);
          void run(
            saveNumbersAction({
              dayChangeHour: num("dayChangeHour"),
              checkinPoints: num("checkinPoints"),
              stampsPerCard: num("stampsPerCard"),
              stampCardBonus: num("stampCardBonus"),
              jankenWinPoints: num("jankenWinPoints"),
              chinchiroWinPoints: num("chinchiroWinPoints"),
              chinchiroBigWinPoints: num("chinchiroBigWinPoints"),
              mochiWinOdds: num("mochiWinOdds"),
              mochiWinPoints: num("mochiWinPoints"),
              mochiDailyWinLimit: num("mochiDailyWinLimit"),
              guestSignupEnabled: f.get("guestSignupEnabled") === "on",
              geoEnabled,
              geoLat: lat.trim() === "" ? null : lat,
              geoLng: lng.trim() === "" ? null : lng,
              geoRadiusM: num("geoRadiusM"),
            }),
          );
        }}
      >
        {banner}
        <Section title="来店・スタンプ">
          <NumField name="checkinPoints" label="来店ポイント" value={n.checkinPoints} />
          <NumField name="stampsPerCard" label="スタンプカードのマス数" value={n.stampsPerCard} />
          <NumField name="stampCardBonus" label="カード達成ボーナス" value={n.stampCardBonus} />
          <NumField name="dayChangeHour" label="1日の切替時刻（時）" value={n.dayChangeHour} hint="例：6 → 朝6時までは前日扱い（深夜営業向け）" />
        </Section>
        <Section title="デイリーゲーム（勝ったときのポイント）">
          <NumField name="jankenWinPoints" label="じゃんけん" value={n.jankenWinPoints} />
          <NumField name="chinchiroWinPoints" label="チンチロ" value={n.chinchiroWinPoints} />
          <NumField name="chinchiroBigWinPoints" label="チンチロ（役で勝ち）" value={n.chinchiroBigWinPoints} hint="ピンゾロ・ゾロ目・シゴロ" />
        </Section>
        <Section title="もちもち連打">
          <NumField name="mochiWinOdds" label="当選確率 1 / ◯" value={n.mochiWinOdds} hint={`1タップごとに 1/${n.mochiWinOdds.toLocaleString()} で当たり`} />
          <NumField name="mochiWinPoints" label="当選ポイント" value={n.mochiWinPoints} />
          <NumField name="mochiDailyWinLimit" label="1日の当選上限（回）" value={n.mochiDailyWinLimit} />
        </Section>
        <Section title="チェックインの位置情報チェック（任意）">
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={geoEnabled} onChange={(e) => setGeoEnabled(e.target.checked)} /> お店の近くでないとチェックインできないようにする
          </label>
          <Field label="お店の緯度">
            <Input value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" placeholder="35.6812" />
          </Field>
          <Field label="お店の経度">
            <Input value={lng} onChange={(e) => setLng(e.target.value)} inputMode="decimal" placeholder="139.7671" />
          </Field>
          <NumField name="geoRadiusM" label="範囲（メートル）" value={n.geoRadiusM} hint="GPSの誤差があるので300m程度がおすすめ" />
          <div className="flex items-end">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                navigator.geolocation?.getCurrentPosition(
                  (p) => {
                    setLat(p.coords.latitude.toFixed(6));
                    setLng(p.coords.longitude.toFixed(6));
                  },
                  () => alert("位置情報を取得できませんでした"),
                  { enableHighAccuracy: true },
                )
              }
            >
              いまいる場所をお店にする（店内で押す）
            </Button>
          </div>
        </Section>
        <Section title="会員登録">
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="guestSignupEnabled" defaultChecked={n.guestSignupEnabled} /> LINE を使わない仮登録（ニックネームだけ）を受け付ける
          </label>
          <p className="text-xs text-slate-500 sm:col-span-2">
            公式LINE：{lineEnabled ? "連携済み（LINE からの登録が使えます）" : "未設定（公式LINE・LIFF を作ったら環境変数を設定してください。README 参照）"}
          </p>
        </Section>
        <Button disabled={busy}>保存</Button>
      </form>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-2 font-bold text-slate-800">{title}</legend>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
    </fieldset>
  );
}

function RanksForm({ initial }: { initial: Rank[] }) {
  const { run, busy, banner } = useRunner();
  const [rows, setRows] = useState(initial);
  const set = (i: number, patch: Partial<Rank>) => setRows(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  return (
    <Card title="来店ランク">
      <div className="space-y-3">
        {banner}
        <p className="text-xs text-slate-500">来店回数が「必要回数」以上になるとそのランクになります</p>
        <div className="grid grid-cols-[1fr_90px_44px_28px] gap-2 text-xs text-slate-500">
          <span>ランク名</span>
          <span>必要回数</span>
          <span>色</span>
          <span />
        </div>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_90px_44px_28px] items-center gap-2">
            <Input value={r.name} onChange={(e) => set(i, { name: e.target.value })} maxLength={20} />
            <Input type="number" min={0} value={r.minVisits} onChange={(e) => set(i, { minVisits: Number(e.target.value) })} />
            <input type="color" value={r.color} onChange={(e) => set(i, { color: e.target.value })} className="h-9 w-11 rounded border border-slate-300" />
            <button type="button" onClick={() => setRows(rows.filter((_, k) => k !== i))} className="text-slate-400 hover:text-red-600" aria-label="削除">
              ✕
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => setRows([...rows, { name: "", minVisits: (rows.at(-1)?.minVisits ?? 0) + 10, color: "#94a3b8" }])}>
            ＋ ランクを追加
          </Button>
          <Button size="sm" disabled={busy} onClick={() => run(saveRanksAction(rows))}>
            保存
          </Button>
        </div>
      </div>
    </Card>
  );
}

function PlacePointsForm({ initial }: { initial: { darts: number[]; poker: number[] } }) {
  const { run, busy, banner } = useRunner();
  const [pts, setPts] = useState(initial);
  return (
    <Card title="ダーツ・ポーカーの順位ポイント">
      <div className="space-y-4">
        {banner}
        <p className="text-xs text-slate-500">結果入力で付与されるポイントです（ランキングの点数にもなります）。ここにない順位は0ポイント</p>
        {(["darts", "poker"] as const).map((g) => (
          <div key={g}>
            <div className="mb-1 font-bold">{g === "darts" ? "🎯 ダーツ" : "🃏 ポーカー"}</div>
            <div className="flex flex-wrap gap-2">
              {pts[g].map((p, i) => (
                <label key={i} className="flex items-center gap-1 text-sm">
                  {i + 1}位
                  <input
                    type="number"
                    min={0}
                    value={p}
                    onChange={(e) => setPts({ ...pts, [g]: pts[g].map((x, k) => (k === i ? Number(e.target.value) : x)) })}
                    className="w-20 rounded-lg border border-slate-300 px-2 py-1"
                  />
                </label>
              ))}
              <button type="button" className="text-sm text-rose-700" onClick={() => setPts({ ...pts, [g]: [...pts[g], 0] })}>
                ＋順位
              </button>
              {pts[g].length > 0 && (
                <button type="button" className="text-sm text-slate-400" onClick={() => setPts({ ...pts, [g]: pts[g].slice(0, -1) })}>
                  −順位
                </button>
              )}
            </div>
            <Button size="sm" className="mt-2" disabled={busy} onClick={() => run(savePlacePointsAction(g, pts[g]))}>
              {g === "darts" ? "ダーツ" : "ポーカー"}を保存
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}
