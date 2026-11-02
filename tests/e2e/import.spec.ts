import { expect, test } from "@playwright/test";

test("以前の勤怠を一括取り込み：確認 → 名前の対応 → 登録 → もう一度は登録済み", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("ログインID").fill("admin");
  await page.getByLabel("パスワード").fill("admin1234");
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page.getByRole("heading", { name: "ダッシュボード" })).toBeVisible();

  await page.goto("/admin/attendance");
  await page.getByRole("link", { name: "以前の勤怠を一括取り込み" }).click();
  const text = "名前,日付,出勤,退勤,休憩\nヤマダ,2026-09-02,17:58,00:11,30\nスズキ,2026-09-03,16:49,,\nだれか,2026-09-03,16:00,23:00,0";
  await page.getByLabel("取り込むデータ").fill(text);
  await page.getByRole("button", { name: "内容を確認する" }).click();
  await expect(page.getByText("従業員を選択")).toBeVisible();
  await expect(page.getByText("退勤なし（取り込み後に要確認に出ます）")).toBeVisible();
  await page.getByRole("button", { name: "2件を登録する" }).click({ trial: true });
  await page.screenshot({ path: "test-results/import-preview.png", fullPage: true });

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "2件を登録する" }).click();
  await expect(page.getByText("2件を登録しました")).toBeVisible();

  await page.getByLabel("取り込むデータ").fill(text);
  await page.getByRole("button", { name: "内容を確認する" }).click();
  await expect(page.getByText("登録済み").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "0件を登録する" })).toBeDisabled();
});
