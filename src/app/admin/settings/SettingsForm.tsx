"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, Button, Card, Field, Input, Select } from "@/components/ui";
import { WEEKDAY_JA } from "@/lib/time";
import type { SettingsInput } from "@/server/settings";
import { saveSettingsAction, setCalendarDayAction } from "./actions";

type Values = Omit<SettingsInput, "holidayWeekdays"> & { holidayWeekdays: number[] };

export function SettingsForm({ initial }: { initial: Values }) {
  const [v, setV] = useState<Values>(initial);
  const [result, setResult] = useState<{ error?: string; message?: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (patch: Partial<Values>) => setV((x) => ({ ...x, ...patch }));
  const num = (key: keyof Values, label: string, hint?: string, unit?: string) => (
    <Field label={label} hint={hint}>
      <div className="flex items-center gap-2">
        <Input type="number" value={String(v[key] ?? "")} onChange={(e) => set({ [key]: e.target.value } as Partial<Values>)} />
        {unit && <span className="text-sm whitespace-nowrap text-slate-600">{unit}</span>}
      </div>
    </Field>
  );

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveSettingsAction(v);
          setResult(r.ok ? { message: r.message } : { error: r.error });
        });
      }}
    >
      <Card title="営業時間・日付の扱い">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="店舗名">
            <Input value={v.storeName} onChange={(e) => set({ storeName: e.target.value })} />
          </Field>
          {num("dayChangeHour", "日付切替時刻（P-04）", "この時刻より前の出勤は前日の勤務として扱います", "時")}
          <Field label="開店時刻（P-05）">
            <Input type="time" value={v.openTime} onChange={(e) => set({ openTime: e.target.value })} />
          </Field>
          <Field label="閉店時刻" hint="開店より前の時刻なら翌日">
            <Input type="time" value={v.closeTime} onChange={(e) => set({ closeTime: e.target.value })} />
          </Field>
        </div>
      </Card>

      <Card title="勤怠異常チェック（P-10, P-11）">
        <div className="grid gap-4 sm:grid-cols-2">
          {num("longWorkMinutes", "長時間勤務とみなす拘束時間", "720分 = 12時間", "分超")}
          {num("outOfHoursMarginMinutes", "営業時間外とみなす幅", "開店前・閉店後にこれ以上離れた打刻", "分")}
          {num("missingClockOutHours", "退勤漏れとみなす時間", "出勤からこの時間たっても退勤がない", "時間")}
          {num("shortWorkMinutes", "短すぎる勤務", "誤打刻の可能性", "分未満")}
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5" checked={v.legalBreakCheckEnabled} onChange={(e) => set({ legalBreakCheckEnabled: e.target.checked })} />
          一般的な休憩不足チェック（実働6時間超→45分、8時間超→60分）を行う
        </label>
      </Card>

      <Card title="休日の休憩チェック（P-12・店舗独自ルール）">
        <div className="mb-4">
          <div className="mb-1 text-sm font-medium text-slate-700">休日とする曜日</div>
          <div className="flex flex-wrap gap-3">
            {WEEKDAY_JA.map((w, i) => (
              <label key={i} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={v.holidayWeekdays.includes(i)}
                  onChange={(e) => set({ holidayWeekdays: e.target.checked ? [...v.holidayWeekdays, i] : v.holidayWeekdays.filter((x) => x !== i) })}
                />
                {w}
              </label>
            ))}
            <label className="flex items-center gap-1">
              <input type="checkbox" className="h-5 w-5" checked={v.holidayIncludesPublic} onChange={(e) => set({ holidayIncludesPublic: e.target.checked })} />
              祝日
            </label>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {num("holidayBreakWorkMinutes", "対象とする実働時間", "420分 = 7時間", "分以上")}
          {num("holidayBreakRequiredMinutes", "必要な休憩", "これ未満なら「休憩時間を確認してください」", "分")}
        </div>
      </Card>

      <Card title="シフト（P-19, P-24, P-25）">
        <div className="grid gap-4 sm:grid-cols-2">
          {num("requestNotifyDay", "提出依頼の通知日（毎月）", undefined, "日")}
          {num("requestReminderDay", "未提出者リマインド日", undefined, "日")}
          {num("requestDeadlineDay", "提出締切日", "その日の23:59まで", "日")}
          {num("publishDay", "シフト公開予定日", undefined, "日")}
          {num("lateGraceMinutes", "遅刻とみなす猶予", undefined, "分")}
          {num("maxConsecutiveDays", "連勤の上限（希望条件）", undefined, "日")}
        </div>
      </Card>

      {result?.error && <Alert kind="error">{result.error}</Alert>}
      {result?.message && <Alert kind="success">{result.message}</Alert>}
      <Button type="submit" disabled={pending}>設定を保存</Button>
    </form>
  );
}

export function CalendarForm() {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [kind, setKind] = useState("closed");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ error?: string; message?: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const input = {
          closed: { isClosed: true, isHoliday: null, note },
          holiday: { isClosed: false, isHoliday: true, note },
          weekday: { isClosed: false, isHoliday: false, note },
          clear: { isClosed: false, isHoliday: null, note: "" },
        }[kind]!;
        start(async () => {
          const r = await setCalendarDayAction(date, input);
          setMsg(r.ok ? { message: r.message } : { error: r.error });
          router.refresh();
        });
      }}
    >
      <Field label="日付">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </Field>
      <Field label="種類">
        <Select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="closed">店休日（シフトを入れない）</option>
          <option value="holiday">休日扱い（休憩チェック対象）</option>
          <option value="weekday">平日扱い（土日祝でも対象外）</option>
          <option value="clear">指定を解除</option>
        </Select>
      </Field>
      <Field label="メモ">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="例：年末休業" />
      </Field>
      <Button type="submit" variant="secondary" disabled={pending}>登録</Button>
      {msg?.error && <span className="text-sm text-red-700">{msg.error}</span>}
      {msg?.message && <span className="text-sm text-emerald-700">{msg.message}</span>}
    </form>
  );
}
