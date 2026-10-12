// 自動シフト生成（DB非依存・決定的）。設計は docs/05-shift-generation.md
//
// 絶対条件（破らない）: 出勤不可日・店休日に入れない / 1日1枠 / 最大勤務日数 / 「絶対NG」ペア / 枠指定の希望
// 必要人数（絶対条件）は候補者不足で満たせない場合があるため、不足としてレポートする。
// 希望条件はペナルティ（スコア）で評価し、貪欲法＋局所探索で小さくする。

import { parseHm } from "../time";

export type Priority = "HIGH" | "MID" | "LOW";
export type Volume = "MORE" | "NORMAL" | "LESS";

export interface GenSlot {
  date: string;
  patternId: string;
  startTime: string;
  endTime: string;
  required: number;
}

export interface GenAvailability {
  /** 希望する枠（null = どれでも可） */
  patternId: string | null;
  /** 希望時間（任意）"HH:MM" */
  startTime: string | null;
  endTime: string | null;
}

export interface GenStaff {
  id: string;
  name: string;
  /** 出勤可の日 → 希望内容。ここに無い日は不可 */
  available: Map<string, GenAvailability>;
  priority: Priority;
  volume: Volume;
  maxDays: number | null;
  minDays: number | null;
  fillAll: boolean;
  /** 前月末の勤務日（月をまたぐ連勤の判定にだけ使う） */
  priorDates?: string[];
}

export interface GenPair {
  a: string;
  b: string;
  strength: "HARD" | "SOFT";
}

export interface GenAssignment {
  date: string;
  employeeId: string;
  patternId: string | null;
  startTime: string;
  endTime: string;
  /** 手動配置（固定して残す） */
  fixed?: boolean;
}

export interface GenInput {
  slots: GenSlot[];
  staff: GenStaff[];
  pairs: GenPair[];
  /** 残す手動配置 */
  fixed: GenAssignment[];
  maxConsecutiveDays: number;
  /** 営業日の日付切替時刻（深夜の時刻を翌暦日として扱う） */
  dayChangeHour?: number;
  seed?: number;
  iterations?: number;
}

export interface Shortage {
  date: string;
  patternId: string;
  required: number;
  assigned: number;
  /** その日に出勤可能だった人と、入れられなかった理由（例「山田（最大日数）」） */
  candidates: string[];
}

export interface StaffReport {
  id: string;
  name: string;
  days: number;
  target: number;
  availableDays: number;
  minDays: number | null;
  maxDays: number | null;
  notes: string[];
}

export interface GenResult {
  assignments: GenAssignment[];
  shortages: Shortage[];
  staff: StaffReport[];
  warnings: string[];
  score: number;
}

export const WEIGHTS = {
  shortage: 1000,
  minDays: 50,
  target: 10,
  fillAll: 15,
  priority: 6,
  softPair: 30,
  consecutive: 20,
  balance: 2,
};

/** 決定的な乱数（mulberry32） */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 希望時間がある場合、枠が希望時間内（前後30分の余裕）に収まるか。
 * 枠・希望とも、開始が日付切替時刻より前なら翌暦日の時刻とみなす（営業日基準）
 */
export function fitsTime(slot: Pick<GenSlot, "startTime" | "endTime">, a: GenAvailability, dayChangeHour = 6) {
  if (!a.startTime || !a.endTime) return true;
  const norm = (s: string, e: string) => {
    let st = parseHm(s);
    if (st < dayChangeHour * 60) st += 1440;
    let en = parseHm(e);
    while (en <= st) en += 1440;
    return [st, en] as const;
  };
  const [ps, pe] = norm(slot.startTime, slot.endTime);
  const [ws, we] = norm(a.startTime, a.endTime);
  return ps >= ws - 30 && pe <= we + 30;
}

function dayIndex(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function generateShifts(input: GenInput): GenResult {
  const random = rng(input.seed ?? 1);
  const iterations = input.iterations ?? 3000;
  const staffById = new Map(input.staff.map((s) => [s.id, s]));
  const warnings: string[] = [];

  const hardPairs = new Map<string, Set<string>>();
  const softPairs = input.pairs.filter((p) => p.strength === "SOFT");
  for (const p of input.pairs.filter((p) => p.strength === "HARD")) {
    hardPairs.set(p.a, (hardPairs.get(p.a) ?? new Set()).add(p.b));
    hardPairs.set(p.b, (hardPairs.get(p.b) ?? new Set()).add(p.a));
  }

  // ── 状態：slotIndex → 担当者、employee → 勤務日 ──
  const slots = input.slots.filter((s) => s.required > 0);
  const slotKey = (s: { date: string; patternId: string | null }) => `${s.date}|${s.patternId}`;
  const slotIndex = new Map(slots.map((s, i) => [slotKey(s), i]));
  const members: string[][] = slots.map(() => []);
  const workDates = new Map<string, Set<string>>(input.staff.map((s) => [s.id, new Set()]));
  const fixedKeys = new Set<string>();
  const fixedOut: GenAssignment[] = [];

  for (const f of input.fixed) {
    const dates = workDates.get(f.employeeId) ?? new Set<string>();
    workDates.set(f.employeeId, dates);
    if (dates.has(f.date)) continue;
    dates.add(f.date);
    const idx = slotIndex.get(slotKey(f));
    if (idx !== undefined) {
      members[idx].push(f.employeeId);
      fixedKeys.add(`${idx}|${f.employeeId}`);
    } else {
      // 枠外の手動配置（時間指定など）はそのまま残す
      fixedOut.push({ ...f, fixed: true });
    }
  }

  const eligible = (staffId: string, idx: number) => {
    const st = staffById.get(staffId);
    const slot = slots[idx];
    if (!st) return false;
    const a = st.available.get(slot.date);
    if (!a) return false;
    if (a.patternId && a.patternId !== slot.patternId) return false;
    return fitsTime(slot, a, input.dayChangeHour ?? 6);
  };

  /** 絶対条件を満たして配置できるか（slot 内の入替時は ignore を除いて判定） */
  const canPlace = (staffId: string, idx: number, ignore?: { staffId: string; date: string }) => {
    if (!eligible(staffId, idx)) return false;
    const st = staffById.get(staffId)!;
    const date = slots[idx].date;
    const dates = workDates.get(staffId)!;
    if (dates.has(date)) return false;
    if (st.maxDays !== null && dates.size >= st.maxDays) return false;
    const enemies = hardPairs.get(staffId);
    if (enemies) {
      for (const [i, s] of slots.entries()) {
        if (s.date !== date) continue;
        for (const m of members[i]) if (enemies.has(m) && !(ignore && ignore.staffId === m && ignore.date === date)) return false;
      }
      // 枠外の手動配置も含める
      if (fixedOut.some((f) => f.date === date && enemies.has(f.employeeId))) return false;
    }
    return true;
  };

  // ── 目標日数 ──
  const totalRequired = slots.reduce((s, x) => s + x.required, 0);
  const activeStaff = input.staff.filter((s) => s.available.size > 0);
  const base = activeStaff.length ? totalRequired / activeStaff.length : 0;
  const availableDays = (s: GenStaff) => [...s.available.keys()].filter((d) => slots.some((x) => x.date === d)).length;
  const targets = new Map<string, number>();
  for (const s of input.staff) {
    const avail = availableDays(s);
    let t = s.fillAll ? avail : base * (s.volume === "MORE" ? 1.3 : s.volume === "LESS" ? 0.7 : 1);
    t = Math.min(t, avail);
    if (s.maxDays !== null) t = Math.min(t, s.maxDays);
    if (s.minDays !== null) t = Math.max(t, Math.min(s.minDays, avail));
    targets.set(s.id, Math.round(t * 10) / 10);
  }

  // ── スコア（小さいほど良い） ──
  const sortedDayIdx = (dates: Set<string>) => [...dates].map(dayIndex).sort((a, b) => a - b);
  /** 前月末の勤務も含めた勤務日（連勤判定用） */
  const withPrior = (s: GenStaff, dates: Set<string>) => sortedDayIdx(new Set([...(s.priorDates ?? []), ...dates]));
  function staffPenalty(s: GenStaff) {
    const dates = workDates.get(s.id)!;
    const n = dates.size;
    const target = targets.get(s.id)!;
    let p = 0;
    if (s.minDays !== null && n < s.minDays) p += (s.minDays - n) * WEIGHTS.minDays;
    p += Math.abs(n - target) * (s.fillAll ? WEIGHTS.fillAll : WEIGHTS.target);
    p += (n - target) ** 2 * WEIGHTS.balance;
    p += n * (s.priority === "HIGH" ? -WEIGHTS.priority : s.priority === "LOW" ? WEIGHTS.priority : 0);
    // 連勤（「できるだけ全部入れる」の人は店長の明示的な指定を優先し、連勤は警告のみ）
    if (s.fillAll) return p;
    const idx = withPrior(s, dates);
    let run = 0;
    for (let i = 0; i < idx.length; i++) {
      run = i > 0 && idx[i] === idx[i - 1] + 1 ? run + 1 : 1;
      if (run > input.maxConsecutiveDays) p += WEIGHTS.consecutive;
    }
    return p;
  }
  function pairPenalty() {
    let p = 0;
    for (const pair of softPairs) {
      const a = workDates.get(pair.a);
      const b = workDates.get(pair.b);
      if (!a || !b) continue;
      for (const d of a) if (b.has(d)) p += WEIGHTS.softPair;
    }
    return p;
  }
  function shortagePenalty() {
    return slots.reduce((sum, s, i) => sum + Math.max(0, s.required - members[i].length) * WEIGHTS.shortage, 0);
  }
  const score = () => shortagePenalty() + pairPenalty() + input.staff.reduce((s, st) => s + staffPenalty(st), 0);

  const place = (staffId: string, idx: number) => {
    members[idx].push(staffId);
    workDates.get(staffId)!.add(slots[idx].date);
  };
  const unplace = (staffId: string, idx: number) => {
    members[idx] = members[idx].filter((m) => m !== staffId);
    workDates.get(staffId)!.delete(slots[idx].date);
  };

  // ── 1. 貪欲割当：候補の少ない枠から ──
  const candidateCount = slots.map((_, i) => input.staff.filter((s) => eligible(s.id, i)).length);
  const order = slots.map((_, i) => i).sort((a, b) => candidateCount[a] - candidateCount[b] || slots[a].date.localeCompare(slots[b].date));
  for (const idx of order) {
    while (members[idx].length < slots[idx].required) {
      let best: { id: string; delta: number } | null = null;
      for (const s of input.staff) {
        if (!canPlace(s.id, idx)) continue;
        const before = staffPenalty(s) + pairPenalty();
        place(s.id, idx);
        const delta = staffPenalty(s) + pairPenalty() - before;
        unplace(s.id, idx);
        if (!best || delta < best.delta || (delta === best.delta && s.id < best.id)) best = { id: s.id, delta };
      }
      if (!best) break;
      place(best.id, idx);
    }
  }

  // ── 2. 局所探索：差し替え・入れ替え・不足枠の補充 ──
  let current = score();
  const movable = () => {
    const list: { idx: number; staffId: string }[] = [];
    members.forEach((ms, idx) => ms.forEach((m) => !fixedKeys.has(`${idx}|${m}`) && list.push({ idx, staffId: m })));
    return list;
  };
  for (let it = 0; it < iterations && slots.length > 0; it++) {
    const r = random();
    if (r < 0.5) {
      // 差し替え：ある配置を別の候補者へ
      const list = movable();
      if (!list.length) continue;
      const { idx, staffId } = list[Math.floor(random() * list.length)];
      const others = input.staff.filter((s) => s.id !== staffId);
      const cand = others[Math.floor(random() * others.length)];
      if (!cand) continue;
      unplace(staffId, idx);
      if (canPlace(cand.id, idx)) {
        place(cand.id, idx);
        const next = score();
        if (next <= current) {
          current = next;
          continue;
        }
        unplace(cand.id, idx);
      }
      place(staffId, idx);
    } else if (r < 0.85) {
      // 入れ替え：別の日の2人を交換
      const list = movable();
      if (list.length < 2) continue;
      const x = list[Math.floor(random() * list.length)];
      const y = list[Math.floor(random() * list.length)];
      if (x.staffId === y.staffId || slots[x.idx].date === slots[y.idx].date) continue;
      unplace(x.staffId, x.idx);
      unplace(y.staffId, y.idx);
      if (canPlace(x.staffId, y.idx) && canPlace(y.staffId, x.idx)) {
        place(x.staffId, y.idx);
        place(y.staffId, x.idx);
        const next = score();
        if (next <= current) {
          current = next;
          continue;
        }
        unplace(x.staffId, y.idx);
        unplace(y.staffId, x.idx);
      }
      place(x.staffId, x.idx);
      place(y.staffId, y.idx);
    } else {
      // 不足枠の補充：他の日の配置を外してでも埋められるか
      const short = slots.map((s, i) => i).filter((i) => members[i].length < slots[i].required);
      if (!short.length) continue;
      const idx = short[Math.floor(random() * short.length)];
      const cands = input.staff.filter((s) => eligible(s.id, idx) && !workDates.get(s.id)!.has(slots[idx].date));
      const cand = cands[Math.floor(random() * cands.length)];
      if (!cand) continue;
      // 最大日数で入れない場合は、他の日の配置を1つ外して試す
      const removable = movable().filter((m) => m.staffId === cand.id);
      const drop = removable.length ? removable[Math.floor(random() * removable.length)] : null;
      if (drop) unplace(drop.staffId, drop.idx);
      if (canPlace(cand.id, idx)) {
        place(cand.id, idx);
        const next = score();
        if (next <= current) {
          current = next;
          continue;
        }
        unplace(cand.id, idx);
      }
      if (drop) place(drop.staffId, drop.idx);
    }
  }

  // ── 3. 結果・レポート ──
  const assignments: GenAssignment[] = [...fixedOut];
  members.forEach((ms, idx) =>
    ms.forEach((m) =>
      assignments.push({
        date: slots[idx].date,
        employeeId: m,
        patternId: slots[idx].patternId,
        startTime: slots[idx].startTime,
        endTime: slots[idx].endTime,
        fixed: fixedKeys.has(`${idx}|${m}`),
      }),
    ),
  );
  assignments.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.employeeId.localeCompare(b.employeeId));

  const shortages: Shortage[] = slots
    .map((s, i) => ({
      date: s.date,
      patternId: s.patternId,
      required: s.required,
      assigned: members[i].length,
      candidates: input.staff.filter((st) => eligible(st.id, i)).map((st) => {
        const dates = workDates.get(st.id)!;
        const enemies = hardPairs.get(st.id);
        const reason = dates.has(s.date)
          ? "同日に別の枠"
          : st.maxDays !== null && dates.size >= st.maxDays
            ? "最大日数"
            : enemies && [...enemies].some((x) => workDates.get(x)?.has(s.date))
              ? "絶対NGの相手と同日"
              : "";
        return reason ? `${st.name}（${reason}）` : st.name;
      }),
    }))
    .filter((s) => s.assigned < s.required);

  const staff: StaffReport[] = input.staff.map((s) => {
    const days = workDates.get(s.id)!.size;
    const avail = availableDays(s);
    const target = targets.get(s.id)!;
    const notes: string[] = [];
    if (s.minDays !== null && days < s.minDays) {
      notes.push(avail < s.minDays ? `最低${s.minDays}日に届かず（出勤可が${avail}日のみ）` : `最低${s.minDays}日に届かず`);
    }
    if (s.fillAll && days < avail) notes.push(`出勤可${avail}日のうち${days}日（他の条件・人数の都合）`);
    const idx = withPrior(s, workDates.get(s.id)!);
    let run = 0;
    let maxRun = 0;
    for (let i = 0; i < idx.length; i++) {
      run = i > 0 && idx[i] === idx[i - 1] + 1 ? run + 1 : 1;
      maxRun = Math.max(maxRun, run);
    }
    if (maxRun > input.maxConsecutiveDays) notes.push(`${maxRun}連勤があります`);
    return { id: s.id, name: s.name, days, target, availableDays: avail, minDays: s.minDays, maxDays: s.maxDays, notes };
  });

  for (const pair of softPairs) {
    const a = workDates.get(pair.a);
    const b = workDates.get(pair.b);
    if (!a || !b) continue;
    const same = [...a].filter((d) => b.has(d)).length;
    if (same > 0) warnings.push(`${staffById.get(pair.a)?.name}さんと${staffById.get(pair.b)?.name}さんが同じ日に${same}回入っています（なるべく別の日の希望）`);
  }

  return { assignments, shortages, staff, warnings, score: current };
}
