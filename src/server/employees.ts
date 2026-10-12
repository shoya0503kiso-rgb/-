import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "./db";
import { UserError } from "./errors";

export const EMPLOYMENT_TYPES = { PART: "アルバイト", FULL: "正社員", OTHER: "その他" } as const;

const optionalInt = (max: number) =>
  z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), z.coerce.number().int().min(0).max(max).nullable());

export const employeeSchema = z.object({
  name: z.string().trim().min(1, "名前を入力してください").max(30),
  kana: z.string().trim().max(60).default(""),
  employmentType: z.enum(["PART", "FULL", "OTHER"]).default("PART"),
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
  hourlyWage: optionalInt(100000),
  baseMaxDays: optionalInt(31),
  baseMinDays: optionalInt(31),
  note: z.string().max(1000).default(""),
});

export type EmployeeInput = z.input<typeof employeeSchema>;

function parse(input: EmployeeInput) {
  const r = employeeSchema.safeParse(input);
  if (!r.success) throw new UserError(r.error.issues[0]?.message ?? "入力内容を確認してください");
  const v = r.data;
  if (v.baseMaxDays !== null && v.baseMinDays !== null && v.baseMinDays > v.baseMaxDays) {
    throw new UserError("最低勤務日数が最大勤務日数を超えています");
  }
  return v;
}

export function listEmployees(opts: { includeInactive?: boolean } = {}) {
  return prisma.employee.findMany({
    where: opts.includeInactive ? {} : { active: true },
    orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { kana: "asc" }, { name: "asc" }],
    include: { lineAccount: true },
  });
}

export function getEmployee(id: string) {
  return prisma.employee.findUnique({ where: { id }, include: { lineAccount: true } });
}

export function createEmployee(input: EmployeeInput) {
  return prisma.employee.create({ data: parse(input) });
}

export async function updateEmployee(id: string, input: EmployeeInput) {
  return prisma.employee.update({ where: { id }, data: parse(input) });
}

/** PIN を設定（空文字で解除）。P-06 */
export async function setEmployeePin(id: string, pin: string) {
  if (pin === "") {
    await prisma.employee.update({ where: { id }, data: { pinHash: null } });
    return;
  }
  if (!/^\d{4}$/.test(pin)) throw new UserError("PINは4桁の数字で入力してください");
  await prisma.employee.update({ where: { id }, data: { pinHash: await bcrypt.hash(pin, 8) } });
}

export async function verifyPin(pinHash: string | null, pin: string | undefined) {
  if (!pinHash) return true;
  if (!pin) return false;
  return bcrypt.compare(pin, pinHash);
}
