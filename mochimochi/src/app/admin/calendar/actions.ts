"use server";

import { revalidatePath } from "next/cache";
import { isValidDate } from "@/lib/time";
import { adminAction } from "@/server/admin-action";
import { prisma } from "@/server/db";
import { UserError } from "@/server/errors";

function checkDate(date: string) {
  if (!isValidDate(date)) throw new UserError("日付が正しくありません");
  return date;
}

export async function saveEventAction(input: { id?: string; date: string; title: string; startTime: string; description: string }) {
  return adminAction(async () => {
    const date = checkDate(String(input.date));
    const title = String(input.title ?? "").trim();
    if (!title) throw new UserError("イベント名を入れてください");
    const startTime = String(input.startTime ?? "").trim();
    if (startTime && !/^\d{1,2}:\d{2}$/.test(startTime)) throw new UserError("開始時刻は 20:00 のように入れてください");
    const data = { date, title: title.slice(0, 60), startTime, description: String(input.description ?? "").slice(0, 500) };
    if (input.id) await prisma.event.update({ where: { id: String(input.id) }, data });
    else await prisma.event.create({ data });
    revalidatePath("/admin/calendar");
  }, "保存しました");
}

export async function deleteEventAction(id: string) {
  return adminAction(async () => {
    await prisma.event.delete({ where: { id: String(id) } });
    revalidatePath("/admin/calendar");
  }, "削除しました");
}

export async function savePointDayAction(input: { date: string; mode: string; value: number; label: string }) {
  return adminAction(async () => {
    const date = checkDate(String(input.date));
    const mode = input.mode === "fixed" ? "fixed" : "multiply";
    const value = Number(input.value);
    if (!Number.isFinite(value) || value <= 0 || value > 100000) throw new UserError("値を正しく入れてください");
    if (mode === "multiply" && value > 100) throw new UserError("倍率は100倍までです");
    const data = { mode, value, label: String(input.label ?? "").trim().slice(0, 30) };
    await prisma.pointDay.upsert({ where: { date }, update: data, create: { date, ...data } });
    revalidatePath("/admin/calendar");
  }, "ポイント倍率を設定しました");
}

export async function deletePointDayAction(date: string) {
  return adminAction(async () => {
    await prisma.pointDay.deleteMany({ where: { date: String(date) } });
    revalidatePath("/admin/calendar");
  }, "ポイント倍率を解除しました");
}
