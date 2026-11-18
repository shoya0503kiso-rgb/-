"use server";
import { revalidatePath } from "next/cache";
import { adminAction } from "@/server/admin-action";
import { cancelReservation, changePeople, setConfirmed, setNote } from "@/server/reservations";

function done<T>(p: Promise<T>) {
  return p.finally(() => revalidatePath("/admin"));
}

export async function setConfirmedAction(id: string, confirmed: boolean) {
  return done(adminAction(() => setConfirmed(id, confirmed)));
}
export async function cancelAction(id: string) {
  return done(adminAction(() => cancelReservation(id), "キャンセルしました"));
}
export async function changePeopleAction(id: string, people: number) {
  return done(adminAction(() => changePeople(id, people), "人数を変更し、金額を計算し直しました"));
}
export async function setNoteAction(id: string, note: string) {
  return done(adminAction(() => setNote(id, note), "メモを保存しました"));
}
