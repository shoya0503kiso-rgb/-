"use server";
import { runAction } from "@/server/errors";
import { UserError } from "@/server/errors";
import { submitRequest, type RequestDayInput } from "@/server/shifts/requests";
import { verifyStaffToken } from "@/server/staff-link";
import { isValidYearMonth } from "@/lib/time";

export async function submitStaffRequestAction(token: string, ym: string, days: RequestDayInput[], comment: string) {
  return runAction(async () => {
    const employeeId = verifyStaffToken(token, "submit");
    if (!employeeId) throw new UserError("リンクの有効期限が切れています。LINEで「シフト提出」と送ると新しいリンクが届きます。");
    if (!isValidYearMonth(ym)) throw new UserError("対象月が正しくありません");
    const r = await submitRequest(employeeId, ym, { days, comment }, "STAFF");
    return { okDays: r.okDays };
  }, "提出しました");
}
