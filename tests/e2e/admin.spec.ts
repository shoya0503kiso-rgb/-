import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, id: string, pw: string) {
  await page.goto("/login");
  await page.getByLabel("ログインID").fill(id);
  await page.getByLabel("パスワード").fill(pw);
  await page.getByRole("button", { name: "ログイン" }).click();
}

test("管理者の追加 → 仮パスワードでは変更画面以外に入れない → 変更後は使える", async ({ page }) => {
  await login(page, "admin", "admin1234");
  await expect(page.getByRole("heading", { name: "ダッシュボード" })).toBeVisible();
  await page.goto("/admin/settings/admins");
  await page.getByLabel("名前").fill("シフト担当");
  await page.getByLabel("ログインID").fill("shift");
  await page.getByLabel("仮パスワード").fill("karipass-01");
  await page.getByRole("button", { name: "追加" }).click();
  await expect(page.getByText("管理者を追加しました")).toBeVisible();
  await page.getByRole("button", { name: "ログアウト" }).click();

  await login(page, "shift", "karipass-01");
  await expect(page).toHaveURL(/\/admin\/settings\/admins\?first=1/);
  await expect(page.getByText("先にパスワードを変更してください")).toBeVisible();
  await page.goto("/admin/attendance");
  await expect(page).toHaveURL(/\/admin\/settings\/admins/);
  expect((await page.request.get("/api/admin/export?ym=2026-10")).status()).toBe(403);
  // 変更画面にいても、パスワード変更以外の操作（管理者の追加）はできない
  await page.getByLabel("名前").fill("勝手に追加");
  await page.getByLabel("ログインID").fill("intruder");
  await page.getByLabel("仮パスワード").fill("karipass-03");
  await page.getByRole("button", { name: "追加" }).click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("管理者を追加しました")).toHaveCount(0);
  await expect(page.getByText("勝手に追加")).toHaveCount(0);

  await page.getByLabel("現在のパスワード").fill("karipass-01");
  await page.getByLabel("新しいパスワード").first().fill("atarashii-pass-99");
  await page.getByLabel("新しいパスワード（確認）").fill("atarashii-pass-99");
  await page.getByRole("button", { name: "変更する" }).click();
  await expect(page.getByText("パスワードを変更しました")).toBeVisible();
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "ダッシュボード" })).toBeVisible();
});
