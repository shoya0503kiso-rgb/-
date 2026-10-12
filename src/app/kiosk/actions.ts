"use server";
import { requireKioskDevice } from "@/server/auth";
import { prisma } from "@/server/db";
import { runAction } from "@/server/errors";
import { kioskStatus, punch, type PunchType } from "@/server/punch";

const TYPES: PunchType[] = ["CLOCK_IN", "CLOCK_OUT", "BREAK_START", "BREAK_END"];

export async function punchAction(employeeId: string, type: PunchType, pin?: string) {
  return runAction(async () => {
    if (!TYPES.includes(type)) throw new Error("invalid punch type");
    const device = await requireKioskDevice();
    const result = await punch({ employeeId, type, source: "KIOSK", deviceId: device.id, pin });
    await prisma.kioskDevice.update({ where: { id: device.id }, data: { lastUsedAt: new Date() } });
    return { message: result.message, status: result.status, type: result.type };
  });
}

export async function refreshKioskAction() {
  return runAction(async () => {
    await requireKioskDevice();
    return kioskStatus();
  });
}
