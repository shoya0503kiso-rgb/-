"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { redeem } from "@/server/admin-ops";
import { buyLottery, slotChanceResult, spinSlot } from "@/server/casino";
import { checkIn, type CheckinResult } from "@/server/checkin";
import { runAction, type ActionResult } from "@/server/errors";
import { logoutMember, requireMemberForAction } from "@/server/member-auth";
import { recordTaps } from "@/server/mochi";

export async function checkinAction(code: string, geo: { lat: number; lng: number } | null): Promise<ActionResult<CheckinResult>> {
  return runAction(async () => {
    const m = await requireMemberForAction();
    const g = geo && Number.isFinite(geo.lat) && Number.isFinite(geo.lng) ? { lat: geo.lat, lng: geo.lng } : null;
    const r = await checkIn(m.id, String(code ?? ""), g);
    revalidatePath("/me");
    return r;
  });
}

export async function mochiTapAction(taps: number) {
  return runAction(async () => {
    const m = await requireMemberForAction();
    return recordTaps(m.id, Number(taps));
  });
}

export async function slotSpinAction() {
  return runAction(async () => {
    const m = await requireMemberForAction();
    return spinSlot(m.id);
  });
}

export async function slotChanceAction(spinId: string, stops: number[]) {
  return runAction(async () => {
    const m = await requireMemberForAction();
    return slotChanceResult(m.id, String(spinId), Array.isArray(stops) ? stops.slice(0, 3).map(Number) : []);
  });
}

export async function buyLotteryAction(numbers: string[]) {
  return runAction(async () => {
    const m = await requireMemberForAction();
    return buyLottery(m.id, Array.isArray(numbers) ? numbers.map(String) : []);
  });
}

export async function redeemAction(rewardId: string) {
  return runAction(async () => {
    const m = await requireMemberForAction();
    await redeem(m.id, String(rewardId));
    revalidatePath("/rewards");
  }, "交換しました。下のチケットをスタッフに見せてください");
}

export async function logoutAction() {
  await logoutMember();
  redirect("/join");
}
