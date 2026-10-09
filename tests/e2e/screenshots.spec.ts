import { test } from "@playwright/test";

// SCREENSHOTS=<dir> のときだけ実行（UI確認用）
const dir = process.env.SCREENSHOTS;
test.skip(!dir, "SCREENSHOTS 未指定");

test("画面キャプチャ", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("ログインID").fill("admin");
  await page.getByLabel("パスワード").fill("admin1234");
  await page.getByRole("button", { name: "ログイン" }).click();
  await page.waitForURL("**/admin");
  await page.goto("/kiosk/setup");
  await page.getByRole("button", { name: "この端末を登録して打刻画面へ" }).click();
  await page.waitForURL("**/kiosk");
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.getByRole("button", { name: /山田/ }).click();
  await page.getByRole("button", { name: "出勤", exact: true }).click();
  await page.screenshot({ path: `${dir}/kiosk-done.png` });
  await page.getByRole("status").click();
  await page.getByRole("button", { name: /山田/ }).click();
  await page.screenshot({ path: `${dir}/kiosk-panel.png` });
  await page.getByRole("button", { name: "閉じる" }).click();
  await page.screenshot({ path: `${dir}/kiosk.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [name, url] of [["dashboard", "/admin"], ["attendance", "/admin/attendance"], ["settings", "/admin/settings"]]) {
    await page.goto(url);
    await page.screenshot({ path: `${dir}/${name}-mobile.png`, fullPage: true });
  }
});
