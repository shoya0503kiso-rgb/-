// AI補助（P-26）：店長が自然文で書いた指示を、月次条件の「案」に変換する。
// AIは店長の指示を構造化するだけで、勤怠実績から処遇を判断することはしない（要件14）。
// 結果は画面で店長が確認してから反映・保存する。ANTHROPIC_API_KEY 未設定時は無効。
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { ConditionValue } from "../shifts/conditions";
import { UserError } from "../errors";

export const AI_MODEL = "claude-opus-5-5";

export function isAiConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

const SuggestionSchema = z.object({
  conditions: z.array(
    z.object({
      employeeId: z.string(),
      priority: z.enum(["HIGH", "MID", "LOW"]).nullable(),
      volume: z.enum(["MORE", "NORMAL", "LESS"]).nullable(),
      maxDays: z.number().int().nullable(),
      minDays: z.number().int().nullable(),
      fillAll: z.boolean().nullable(),
      memo: z.string().nullable(),
    }),
  ),
  pairs: z.array(z.object({ a: z.string(), b: z.string(), strength: z.enum(["HARD", "SOFT"]), memo: z.string() })),
  /** 指示のうち、条件に変換できなかったもの・あいまいだったもの */
  unresolved: z.array(z.string()),
});

export type AiSuggestion = z.infer<typeof SuggestionSchema>;

export interface StaffRef {
  id: string;
  name: string;
  current: ConditionValue;
}

/** モデル呼び出し（テストでは差し替える） */
export type ModelCall = (system: string, user: string) => Promise<AiSuggestion | null>;

const SYSTEM = `あなたはポーカー店舗のシフト作成を手伝うアシスタントです。
店長が自然な日本語で書いた「今月のスタッフへの指示」を、月次条件の変更案に変換してください。

月次条件の項目:
- priority: 優先度 HIGH（高）/ MID（中）/ LOW（低）
- volume: 勤務量 MORE（多め）/ NORMAL（普通）/ LESS（少なめ）
- maxDays / minDays: 今月の最大・最低勤務日数（整数）
- fillAll: 出勤可能な日はできるだけ全部入れる
- memo: 店長メモ（指示の要約。理由が書かれていれば含める）
- pairs: 同じ日にしないスタッフの組。「絶対」「必ず」など強い表現なら HARD、それ以外は SOFT

ルール:
- 店長が明示的に指示したことだけを変換する。書かれていない人・項目は出力しない（変更しない項目は null）。
- 勤怠の良し悪しや遅刻などから、あなた自身が処遇を判断して条件を足してはいけない。
- employeeId は与えられたスタッフ一覧の id だけを使う。名前が一意に特定できない場合は unresolved に入れる。
- 変換できない指示・あいまいな指示は unresolved に日本語で短く書く。`;

const defaultCall: ModelCall = async (system, user) => {
  const client = new Anthropic();
  const response = await client.beta.messages.parse({
    model: AI_MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(SuggestionSchema) },
    system,
    messages: [{ role: "user", content: user }],
  });
  if (response.stop_reason === "refusal") return null;
  return response.parsed_output ?? null;
};

/**
 * 指示文から条件案を作る。返り値は現在の条件に変更を適用した「案」と、変更点の説明。
 * 不正な値（範囲外の日数・一覧にない従業員）はここで捨てる
 */
export async function suggestConditions(staff: StaffRef[], instruction: string, call: ModelCall = defaultCall) {
  const text = instruction.trim();
  if (!text) throw new UserError("指示を入力してください");
  if (text.length > 2000) throw new UserError("指示は2000文字以内にしてください");
  if (call === defaultCall && !isAiConfigured()) throw new UserError("AI補助は設定されていません（ANTHROPIC_API_KEY）");

  const roster = staff.map((s) => ({ id: s.id, name: s.name, current: s.current }));
  const user = `スタッフ一覧と現在の条件(JSON):\n${JSON.stringify(roster)}\n\n店長の指示:\n${text}`;
  let raw: AiSuggestion | null;
  try {
    raw = await call(SYSTEM, user);
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      console.error("AI補助の呼び出しに失敗", e.status, e.message);
      throw new UserError("AI補助を利用できませんでした。時間をおいて再度お試しください");
    }
    throw e;
  }
  if (!raw) throw new UserError("AI補助で案を作れませんでした。指示の書き方を変えてお試しください");

  const byId = new Map(staff.map((s) => [s.id, s]));
  const days = (n: number | null) => (n === null || !Number.isInteger(n) || n < 0 || n > 31 ? null : n);
  const changes: { employeeId: string; name: string; before: ConditionValue; after: ConditionValue }[] = [];
  const unresolved = [...raw.unresolved];

  for (const c of raw.conditions) {
    const s = byId.get(c.employeeId);
    if (!s) continue;
    const after: ConditionValue = {
      ...s.current,
      ...(c.priority ? { priority: c.priority } : {}),
      ...(c.volume ? { volume: c.volume } : {}),
      ...(c.maxDays !== null && days(c.maxDays) !== null ? { maxDays: days(c.maxDays) } : {}),
      ...(c.minDays !== null && days(c.minDays) !== null ? { minDays: days(c.minDays) } : {}),
      ...(c.fillAll !== null ? { fillAll: c.fillAll } : {}),
      ...(c.memo ? { memo: c.memo.slice(0, 500) } : {}),
    };
    if (after.maxDays !== null && after.minDays !== null && after.minDays > after.maxDays) {
      unresolved.push(`${s.name}さん：最低日数が最大日数を超えるため反映しませんでした`);
      continue;
    }
    if (JSON.stringify(after) !== JSON.stringify(s.current)) changes.push({ employeeId: s.id, name: s.name, before: s.current, after });
  }

  const pairs = raw.pairs
    .filter((p) => p.a !== p.b && byId.has(p.a) && byId.has(p.b))
    .map((p) => ({ ...p, aName: byId.get(p.a)!.name, bName: byId.get(p.b)!.name }));

  return { changes, pairs, unresolved };
}
