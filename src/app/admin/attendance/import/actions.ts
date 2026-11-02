"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth";
import { applyImport, previewImport } from "@/server/attendance-import";
import { runAction } from "@/server/errors";

export async function previewImportAction(text: string, mapping: Record<string, string | null>) {
  await requireAdmin();
  return runAction(() => previewImport(text, mapping));
}

export async function applyImportAction(text: string, mapping: Record<string, string | null>) {
  const admin = await requireAdmin();
  const r = await runAction(() => applyImport(text, mapping, admin));
  revalidatePath("/admin", "layout");
  return r;
}
