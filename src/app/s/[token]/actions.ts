"use server";
import { runAction } from "@/server/errors";
import { UserError } from "@/server/errors";
import { submitRequest, type RequestDayInput } from "@/server/shifts/requests";
import { resolveStaffToken } from "@/server/staff-link";
import { isValidYearMonth } from "@/lib/time";

export async function submitStaffRequestAction(token: string, ym: string, days: RequestDayInput[], comment: string) {
  return runAction(async () => {
    const employee = await resolveStaffToken(token, "submit");
    if (!employee) throw new UserError("リンクの有効期限が切れています。LINEで「シフト提出」と送ると新しいリンクが届きます。");
    if (!isValidYearMonth(ym)) throw new UserError("対象月が正しくありません");
    const r = await submitRequest(employee.id, ym, { days, comment }, "STAFF");
    return { okDays: r.okDays };
  }, "提出しました");
}
