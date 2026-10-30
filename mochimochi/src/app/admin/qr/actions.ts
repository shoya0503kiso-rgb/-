"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { adminAction } from "@/server/admin-action";
import { prisma } from "@/server/db";

/** 今日のQRを作り直す（QRの写真が出回ったときなど。前のQRは使えなくなる） */
export async function rotateQrAction() {
  return adminAction(async () => {
    await prisma.storeSetting.update({ where: { id: 1 }, data: { qrSalt: randomBytes(6).toString("hex") } });
    revalidatePath("/admin/qr");
  }, "QRを作り直しました。タブレットの表示も数分以内に切り替わります");
}

/** タブレット表示用URLを作り直す（前のURLは使えなくなる） */
export async function rotateDisplayKeyAction() {
  return adminAction(async () => {
    await prisma.storeSetting.update({ where: { id: 1 }, data: { qrDisplayKey: randomBytes(18).toString("base64url") } });
    revalidatePath("/admin/qr");
  }, "表示用URLを作り直しました。タブレットで新しいURLを開き直してください");
}
