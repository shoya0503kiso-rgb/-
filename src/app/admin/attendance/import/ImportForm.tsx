"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Alert, Badge, Button, Field, Select, TableWrap, Textarea, td, th } from "@/components/ui";
import { formatDateJa, formatTime } from "@/lib/time";
import type { ImportPreview } from "@/server/attendance-import";
import { applyImportAction, previewImportAction } from "./actions";

const hm = (m: number) => `${m >= 1440 ? "翌" : ""}${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const statusLabel = {
  ok: <Badge color="green">取り込む</Badge>,
  replace: <Badge color="amber">上書き</Badge>,
  exists: <Badge color="gray">登録済み</Badge>,
  duplicate: <Badge color="gray">重複</Badge>,
  unmapped: <Badge color="red">従業員を選択</Badge>,
} as const;

export function ImportForm({ employees }: { employees: { id: string; name: string }[] }) {
  const [text, setText] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<{ error?: string; message?: string } | null>(null);
  const [pending, start] = useTransition();

  const targetCount = preview ? preview.counts.ok + preview.counts.replace : 0;

  function check(mapping: Record<string, string | null> = preview?.mapping ?? {}, ow = overwrite) {
    start(async () => {
      const r = await previewImportAction(text, mapping, ow);
      if (!r.ok) return setResult({ error: r.error });
      setResult(null);
      setPreview(r.data!);
    });
  }

  function apply() {
    if (!preview) return;
    const msg =
      `${targetCount}件の勤怠を登録します。` +
      (preview.counts.replace ? `\nそのうち${preview.counts.replace}件は、登録済みの勤怠を削除して置き換えます（削除した勤怠は履歴に残ります）。` : "") +
      "\nよろしいですか？";
    if (!confirm(msg)) return;
    start(async () => {
      const r = await applyImportAction(text, preview.mapping, overwrite);
      if (!r.ok) return setResult({ error: r.error });
      const d = r.data!;
      setResult({
        message:
          `${d.created}件を登録しました` +
          (d.replaced ? `（置き換えのため削除した勤怠 ${d.replaced}件）` : "") +
          `。取り込まなかった行 ${d.skipped}件` +
          (d.failed.length ? `。登録できなかった行：${d.failed.map((f) => `${f.line}行目 ${f.error}`).join(" / ")}` : ""),
      });
      setPreview(null);
      setText("");
    });
  }

  return (
    <div className="space-y-4">
      {result?.error && <Alert kind="error">{result.error}</Alert>}
      {result?.message && (
        <Alert kind="success">
          {result.message} → <Link className="underline" href="/admin/attendance">月次勤怠</Link> ・ <Link className="underline" href="/admin/anomalies">要確認</Link>
        </Alert>
      )}
      <Field
        label="取り込むデータ"
        hint={
          <>
            1行に1勤務：<code>名前,日付,出勤,退勤,休憩（分）</code>（例：<code>みる,2026-10-02,17:58,00:11,0</code>）。
            退勤が出勤より前の時刻なら翌日の退勤、退勤が空なら「退勤なし」として登録します。休憩の時刻は勤務の真ん中にまとめて入ります。
          </>
        }
      >
        <Textarea
          rows={10}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setPreview(null);
          }}
          className="font-mono text-sm"
          placeholder={"名前,日付,出勤,退勤,休憩\nみる,2026-10-02,17:58,00:11,0"}
        />
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={overwrite}
          onChange={(e) => {
            setOverwrite(e.target.checked);
            if (preview) check(preview.mapping, e.target.checked);
          }}
        />
        <span>
          <b>登録済みの勤怠を上書きする</b>
          <br />
          <span className="text-slate-500">時間が重なる登録済みの勤怠（打刻した記録も含む）を削除して、貼り付けた内容に置き換えます。削除した勤怠は修正履歴に残ります。</span>
        </span>
      </label>
      <Button onClick={() => check({})} disabled={pending || !text.trim()}>
        {pending ? "確認中…" : "内容を確認する"}
      </Button>

      {preview && (
        <div className="space-y-4">
          {preview.errors.length > 0 && (
            <Alert kind="error">
              読み取れない行があります。直してからもう一度「内容を確認する」を押してください。
              <ul className="mt-1 list-disc pl-5">
                {preview.errors.map((e) => (
                  <li key={e.line}>
                    {e.line}行目「{e.text}」：{e.error}
                  </li>
                ))}
              </ul>
            </Alert>
          )}

          <div>
            <h3 className="mb-2 font-semibold">名前の対応</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.entries(preview.mapping).map(([name, id]) => (
                <label key={name} className="flex items-center gap-2 text-sm">
                  <span className="w-28 shrink-0 truncate font-medium">{name}</span>→
                  <Select
                    value={id ?? ""}
                    disabled={pending}
                    onChange={(e) => check({ ...preview.mapping, [name]: e.target.value || null })}
                  >
                    <option value="">（取り込まない）</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </Select>
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">従業員がまだ登録されていない場合は、先に「従業員」で追加してからもう一度確認してください。</p>
          </div>

          <Alert kind="info">
            取り込む <b>{preview.counts.ok}</b>件 ／ 上書き <b>{preview.counts.replace}</b>件 ／ 登録済み {preview.counts.exists}件 ／ 重複 {preview.counts.duplicate}件 ／ 従業員未選択 {preview.counts.unmapped}件
          </Alert>

          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>行</th>
                  <th className={th}>名前</th>
                  <th className={th}>日付</th>
                  <th className={th}>出勤</th>
                  <th className={th}>退勤</th>
                  <th className={th}>休憩</th>
                  <th className={th}>結果</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.line} className={r.status === "ok" || r.status === "replace" ? "" : "text-slate-400"}>
                    <td className={td}>{r.line}</td>
                    <td className={td}>{r.name}</td>
                    <td className={td}>{formatDateJa(r.date)}</td>
                    <td className={td}>{hm(r.inMinutes)}</td>
                    <td className={td}>{r.outMinutes === null ? "—" : hm(r.outMinutes)}</td>
                    <td className={td}>{r.breakMinutes ? `${r.breakMinutes}分` : ""}</td>
                    <td className={td}>
                      {statusLabel[r.status]}
                      {r.replaces?.map((o) => (
                        <span key={o.id} className="ml-2 text-xs text-slate-500 line-through">
                          {formatTime(o.clockIn ? new Date(o.clockIn) : null, r.date) || "—"}〜{formatTime(o.clockOut ? new Date(o.clockOut) : null, r.date) || "—"}
                        </span>
                      ))}
                      {r.warning && <span className="ml-2 text-xs text-amber-700">{r.warning}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>

          <Button onClick={apply} disabled={pending || targetCount === 0 || preview.errors.length > 0}>
            {targetCount}件を登録する
          </Button>
        </div>
      )}
    </div>
  );
}
