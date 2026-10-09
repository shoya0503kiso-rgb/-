"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth";
import { prisma } from "@/server/db";
import { runAction, UserError } from "@/server/errors";
import { setCalendarDay, updateSettings, type SettingsInput } from "@/server/settings";
import { isValidDateStr } from "@/lib/time";

export async function saveSettingsAction(input: SettingsInput) {
  await requireAdmin();
  const r = await runAction(() => updateSettings(input).then(() => undefined), "保存しました");
  revalidatePath("/admin", "layout");
  return r;
}

export async function setCalendarDayAction(date: string, input: { isClosed: boolean; isHoliday: boolean | null; note: string }) {
  await requireAdmin();
  const r = await runAction(async () => {
    if (!isValidDateStr(date)) throw new UserError("日付が正しくありません");
    await setCalendarDay(date, input);
  }, "保存しました");
  revalidatePath("/admin/settings");
  return r;
}

export async function revokeKioskAction(id: string) {
  await requireAdmin();
  await prisma.kioskDevice.update({ where: { id }, data: { revokedAt: new Date() } });
  revalidatePath("/admin/settings");
}
