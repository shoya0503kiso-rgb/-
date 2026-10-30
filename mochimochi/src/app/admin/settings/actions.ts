"use server";

import { revalidatePath } from "next/cache";
import { adminAction } from "@/server/admin-action";
import { UserError } from "@/server/errors";
import { isGameKind } from "@/server/rankings";
import { updateAsset, updateBrand, updateNumbers, updatePlacePoints, updateRanks } from "@/server/settings-update";

function done() {
  revalidatePath("/", "layout");
}

export async function saveNumbersAction(input: unknown) {
  return adminAction(async () => {
    await updateNumbers(input);
    done();
  }, "保存しました");
}

export async function saveBrandAction(input: unknown) {
  return adminAction(async () => {
    await updateBrand(input);
    done();
  }, "保存しました");
}

export async function saveAssetAction(kind: string, dataUrl: string | null) {
  return adminAction(async () => {
    if (kind !== "logo" && kind !== "sound") throw new UserError("不正な操作です");
    await updateAsset(kind, dataUrl === null ? null : String(dataUrl));
    done();
  }, dataUrl === null ? "元に戻しました" : "アップロードしました");
}

export async function saveRanksAction(input: unknown) {
  return adminAction(async () => {
    await updateRanks(input);
    done();
  }, "ランクを保存しました");
}

export async function savePlacePointsAction(game: string, input: unknown) {
  return adminAction(async () => {
    if (!isGameKind(game)) throw new UserError("不正な操作です");
    await updatePlacePoints(game, input);
    done();
  }, "順位ポイントを保存しました");
}
