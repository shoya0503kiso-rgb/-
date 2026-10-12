"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Alert, Badge, Button, Card, Input, Select, TableWrap, td, th } from "@/components/ui";
import { formatDuration } from "@/lib/time";
import type { ActionResult } from "@/server/errors";
import type { ConditionValue } from "@/server/shifts/conditions";
import { addPairAction, copyConditionsAction, removePairAction, saveConditionsAction, suggestConditionsAction } from "../actions";
import { PRIORITY_LABELS, VOLUME_LABELS } from "@/server/shifts/conditions-labels";

interface Row {
  employee: { id: string; name: string };
  saved: boolean;
  value: ConditionValue;
  okDays: number | null;
  ref: { workDays: number; workMinutes: number; late: number; noShow: number; anomalies: number };
}

const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));

export function ConditionsEditor({
  ym,
  rows,
  pairs,
  refLabel,
  refHasShifts,
  aiEnabled,
}: {
  ym: string;
  rows: Row[];
  pairs: { id: string; a: string; b: string; strength: "HARD" | "SOFT"; memo: string }[];
  refLabel: string;
  refHasShifts: boolean;
  aiEnabled: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState(rows.map((r) => r.value));
  // 前月コピーなどでサーバー側の値が変わったら入力欄に反映する（古い値で上書き保存しないように）
  const serverValues = JSON.stringify(rows.map((r) => r.value));
  useEffect(() => {
    setValues(JSON.parse(serverValues));
  }, [serverValues]);
  const [msg, setMsg] = useState<{ error?: string; message?: string } | null>(null);
  const [pending, start] = useTransition();
  const [pair, setPair] = useState({ a: rows[0]?.employee.id ?? "", b: rows[1]?.employee.id ?? "", strength: "SOFT" as "HARD" | "SOFT", memo: "" });
  const set = (i: number, patch: Partial<ConditionValue>) => setValues((vs) => vs.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  const run = (fn: () => Promise<ActionResult<unknown>>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { message: typeof r.data === "string" ? r.data : (r.message ?? "保存しました") } : { error: r.error });
      if (r.ok) router.refresh();
    });

  const applySuggestion = (changes: { employeeId: string; after: ConditionValue }[]) => {
    setValues((vs) => vs.map((v) => changes.find((c) => c.employeeId === v.employeeId)?.after ?? v));
    setMsg({ message: "案を入力欄に反映しました。内容を確認して「条件を保存」を押してください" });
  };

  return (
    <div className="space-y-4">
      {msg && <Alert kind={msg.error ? "error" : "success"}>{msg.error ?? msg.message}</Alert>}
      <AiAssist ym={ym} enabled={aiEnabled} onApply={applySuggestion} onAddPair={(p) => run(() => addPairAction(ym, p.a, p.b, p.strength, p.memo))} />
      <Card
        title="スタッフ別の条件（この月だけ）"
        actions={<Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => copyConditionsAction(ym))}>前月の条件をコピー</Button>}
      >
        <p className="mb-3 text-sm text-slate-600">
          最大日数は<b>絶対条件</b>、それ以外は<b>希望条件</b>として自動生成に使います。右側の{refLabel}の実績は参考情報です（自動で条件を変えることはありません）。
        </p>
        <TableWrap>
          <table className="w-full">
            <thead>
              <tr>
                <th className={th}>スタッフ</th>
                <th className={th}>優先度</th>
                <th className={th}>量</th>
                <th className={th}>最大日数</th>
                <th className={th}>最低日数</th>
                <th className={th}>全部入れる</th>
                <th className={th}>店長メモ</th>
                <th className={`${th} bg-amber-50`}>希望○</th>
                <th className={`${th} bg-amber-50`}>{refLabel} 勤務</th>
                <th className={`${th} bg-amber-50`}>遅刻</th>
                <th className={`${th} bg-amber-50`}>打刻なし</th>
                <th className={`${th} bg-amber-50`}>要確認</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const v = values[i];
                return (
                  <tr key={r.employee.id} className="align-top">
                    <td className={td}>
                      <div className="font-medium">{r.employee.name}</div>
                      {!r.saved && <span className="text-xs text-slate-400">未設定（初期値）</span>}
                    </td>
                    <td className={td}>
                      <Select aria-label={`${r.employee.name} 優先度`} value={v.priority} onChange={(e) => set(i, { priority: e.target.value as ConditionValue["priority"] })} className="w-20 py-1">
                        <option value="HIGH">高</option>
                        <option value="MID">中</option>
                        <option value="LOW">低</option>
                      </Select>
                    </td>
                    <td className={td}>
                      <Select aria-label={`${r.employee.name} 量`} value={v.volume} onChange={(e) => set(i, { volume: e.target.value as ConditionValue["volume"] })} className="w-24 py-1">
                        <option value="MORE">多め</option>
                        <option value="NORMAL">普通</option>
                        <option value="LESS">少なめ</option>
                      </Select>
                    </td>
                    <td className={td}>
                      <Input aria-label={`${r.employee.name} 最大日数`} type="number" min={0} max={31} value={v.maxDays ?? ""} onChange={(e) => set(i, { maxDays: numOrNull(e.target.value) })} className="w-20 py-1" />
                    </td>
                    <td className={td}>
                      <Input aria-label={`${r.employee.name} 最低日数`} type="number" min={0} max={31} value={v.minDays ?? ""} onChange={(e) => set(i, { minDays: numOrNull(e.target.value) })} className="w-20 py-1" />
                    </td>
                    <td className={`${td} text-center`}>
                      <input aria-label={`${r.employee.name} 全部入れる`} type="checkbox" className="h-5 w-5" checked={v.fillAll} onChange={(e) => set(i, { fillAll: e.target.checked })} />
                    </td>
                    <td className={td}>
                      <Input aria-label={`${r.employee.name} メモ`} value={v.memo} onChange={(e) => set(i, { memo: e.target.value })} className="w-56 py-1" placeholder="例：遅刻が続いたので少なめ" />
                    </td>
                    <td className={`${td} bg-amber-50/50`}>{r.okDays === null ? <Badge color="red">未提出</Badge> : `${r.okDays}日`}</td>
                    <td className={`${td} bg-amber-50/50`}>{r.ref.workDays}日 / {formatDuration(r.ref.workMinutes)}</td>
                    <td className={`${td} bg-amber-50/50`}>{refHasShifts ? `${r.ref.late}回` : "—"}</td>
                    <td className={`${td} bg-amber-50/50`}>{refHasShifts ? `${r.ref.noShow}回` : "—"}</td>
                    <td className={`${td} bg-amber-50/50`}>{r.ref.anomalies ? `${r.ref.anomalies}件` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
        <div className="mt-3">
          <Button disabled={pending} onClick={() => run(() => saveConditionsAction(ym, values))}>条件を保存</Button>
        </div>
      </Card>

      <Card title="相性条件（同じ日にしない）">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Select aria-label="スタッフ1" value={pair.a} onChange={(e) => setPair({ ...pair, a: e.target.value })} className="w-auto">
            {rows.map((r) => <option key={r.employee.id} value={r.employee.id}>{r.employee.name}</option>)}
          </Select>
          <span>と</span>
          <Select aria-label="スタッフ2" value={pair.b} onChange={(e) => setPair({ ...pair, b: e.target.value })} className="w-auto">
            {rows.map((r) => <option key={r.employee.id} value={r.employee.id}>{r.employee.name}</option>)}
          </Select>
          <Select aria-label="強さ" value={pair.strength} onChange={(e) => setPair({ ...pair, strength: e.target.value as "HARD" | "SOFT" })} className="w-auto">
            <option value="SOFT">なるべく別の日（希望）</option>
            <option value="HARD">絶対に別の日（絶対）</option>
          </Select>
          <Input aria-label="理由メモ" value={pair.memo} onChange={(e) => setPair({ ...pair, memo: e.target.value })} placeholder="メモ（任意）" className="w-48" />
          <Button variant="secondary" disabled={pending} onClick={() => run(() => addPairAction(ym, pair.a, pair.b, pair.strength, pair.memo))}>追加</Button>
        </div>
        {pairs.length === 0 ? (
          <p className="text-sm text-slate-500">設定はありません</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {pairs.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {p.a} × {p.b}　<Badge color={p.strength === "HARD" ? "red" : "amber"}>{p.strength === "HARD" ? "絶対" : "なるべく"}</Badge>
                  {p.memo && <span className="ml-2 text-slate-500">{p.memo}</span>}
                </span>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => removePairAction(ym, p.id))}>削除</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

type Suggestion = Extract<Awaited<ReturnType<typeof suggestConditionsAction>>, { ok: true }>["data"];

function describe(v: ConditionValue) {
  return [
    `優先度${PRIORITY_LABELS[v.priority]}`,
    VOLUME_LABELS[v.volume],
    v.maxDays !== null ? `最大${v.maxDays}日` : "",
    v.minDays !== null ? `最低${v.minDays}日` : "",
    v.fillAll ? "全部入れる" : "",
    v.memo ? `「${v.memo}」` : "",
  ]
    .filter(Boolean)
    .join("・");
}

/** AI補助：店長の自然文の指示 → 条件の案（P-26）。反映・保存は店長が行う */
function AiAssist({
  ym,
  enabled,
  onApply,
  onAddPair,
}: {
  ym: string;
  enabled: boolean;
  onApply: (changes: { employeeId: string; after: ConditionValue }[]) => void;
  onAddPair: (p: { a: string; b: string; strength: "HARD" | "SOFT"; memo: string }) => void;
}) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<Suggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!enabled) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 px-4 py-3 text-xs text-slate-500">
        AI補助（店長メモの文章から条件の案を作る機能）は未設定です。使う場合は環境変数 ANTHROPIC_API_KEY を設定してください。
      </p>
    );
  }
  return (
    <Card title="AI補助：文章から条件の案を作る">
      <p className="mb-2 text-sm text-slate-600">
        今月の方針を普段の言葉で書くと、AIが条件の案を作ります。<b>AIは書かれた指示を変換するだけ</b>で、勤怠などから勝手に判断はしません。反映前に必ず確認してください。
      </p>
      <textarea
        className="w-full rounded-lg border border-slate-300 p-2 text-sm"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="例：山田さんは今月多めに。田中さんは遅刻が続いたので最大8日。佐藤さんと鈴木さんはなるべく別の日に。"
      />
      <Button
        className="mt-2"
        variant="secondary"
        disabled={pending || !text.trim()}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await suggestConditionsAction(ym, text);
            if (r.ok && r.data) setResult(r.data);
            else if (!r.ok) setError(r.error);
          })
        }
      >
        {pending ? "作成中…" : "案を作る"}
      </Button>
      {error && <div className="mt-2"><Alert kind="error">{error}</Alert></div>}
      {result && (
        <div className="mt-3 space-y-2 text-sm">
          {result.changes.length === 0 && result.pairs.length === 0 && <p>変更点はありませんでした。</p>}
          {result.changes.length > 0 && (
            <div>
              <ul className="space-y-1">
                {result.changes.map((c) => (
                  <li key={c.employeeId}>
                    <b>{c.name}</b>：<span className="text-slate-500 line-through">{describe(c.before)}</span> → {describe(c.after)}
                  </li>
                ))}
              </ul>
              <Button size="sm" className="mt-2" onClick={() => onApply(result.changes)}>この案を入力欄に反映</Button>
            </div>
          )}
          {result.pairs.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              相性条件の案：{p.aName} × {p.bName}（{p.strength === "HARD" ? "絶対" : "なるべく"}別の日）
              <Button size="sm" variant="ghost" onClick={() => onAddPair(p)}>追加</Button>
            </div>
          ))}
          {result.unresolved.length > 0 && (
            <Alert kind="warn">反映できなかった指示：{result.unresolved.join(" / ")}</Alert>
          )}
        </div>
      )}
    </Card>
  );
}
