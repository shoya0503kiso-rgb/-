import { expect, type Page } from "@playwright/test";

/** 既定の締切（前月17日）を過ぎた日に実行しても受付を開始できるよう、締切を対象月の1日に固定する */
export async function ensureDeadlineOpen(page: Page) {
  const ym = page.url().match(/\/admin\/shifts\/(\d{4}-\d{2})/)![1];
  await page.locator('input[type="date"]').first().fill(`${ym}-01`);
  await page.getByRole("button", { name: "締切を変更" }).click();
  await expect(page.getByText(/締切を変更し/)).toBeVisible();
}
