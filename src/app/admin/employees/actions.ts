"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/server/auth";
import { createEmployee, setEmployeePin, updateEmployee, type EmployeeInput } from "@/server/employees";
import { UserError } from "@/server/errors";

export type FormState = { error?: string; message?: string } | null;

function fromForm(form: FormData): EmployeeInput {
  return {
    name: String(form.get("name") ?? ""),
    kana: String(form.get("kana") ?? ""),
    employmentType: String(form.get("employmentType") ?? "PART") as EmployeeInput["employmentType"],
    active: form.get("active") === "on",
    sortOrder: String(form.get("sortOrder") ?? "0"),
    hourlyWage: String(form.get("hourlyWage") ?? ""),
    baseMaxDays: String(form.get("baseMaxDays") ?? ""),
    baseMinDays: String(form.get("baseMinDays") ?? ""),
    note: String(form.get("note") ?? ""),
  };
}

async function guard(fn: () => Promise<FormState>): Promise<FormState> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    throw e;
  }
}

export async function saveEmployeeAction(id: string | null, _: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  let createdId: string | null = null;
  const result = await guard(async () => {
    if (id) {
      await updateEmployee(id, fromForm(form));
      return { message: "保存しました" };
    }
    createdId = (await createEmployee(fromForm(form))).id;
    return null;
  });
  revalidatePath("/admin/employees");
  if (createdId) redirect(`/admin/employees/${createdId}?created=1`);
  return result;
}

export async function setPinAction(id: string, _: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  return guard(async () => {
    const pin = String(form.get("pin") ?? "").trim();
    await setEmployeePin(id, pin);
    revalidatePath(`/admin/employees/${id}`);
    return { message: pin ? "PINを設定しました" : "PINを解除しました" };
  });
}
