import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("ログインID").fill("admin");
  await page.getByLabel("パスワード").fill("admin1234");
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page.getByRole("heading", { name: "ダッシュボード" })).toBeVisible();
}

test("Phase 3: 希望 → 受付終了 → 月次条件 → 自動作成 → 手動修正 → 公開", async ({ page }) => {
  await login(page);
  await page.goto("/admin/shifts");
  await page.getByRole("link", { name: /のシフト$/ }).click();
  await page.waitForURL(/\/admin\/shifts\/\d{4}-\d{2}/);
  const shiftUrl = page.url().split("?")[0];

  // 受付前なら開始（Phase 2 のテストで開始済みの場合もある）
  const startBtn = page.getByRole("button", { name: "受付開始（提出依頼を送信）" });
  if (await startBtn.isVisible()) {
    page.once("dialog", (d) => d.accept());
    await startBtn.click();
    await expect(page.getByText(/受付を開始しました/)).toBeVisible();
  }

  // 未提出の全員分を代理入力（全部○）
  for (const name of ["山田 太郎", "鈴木 一郎", "高橋 美咲", "田中 健", "伊藤 さくら"]) {
    await page.goto(`${shiftUrl}?tab=requests`);
    await page.locator("tr", { hasText: name }).getByRole("link", { name: /代理入力|確認・修正/ }).click();
    await page.getByRole("button", { name: "全部○" }).click();
    await page.getByRole("button", { name: "保存（代理入力）" }).click();
    await expect(page.getByText(/代理入力を保存しました/)).toBeVisible();
  }

  // 受付終了
  await page.goto(`${shiftUrl}?tab=requests`);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "受付を終了" }).click();
  await expect(page.getByText("受付を終了しました")).toBeVisible();

  // 月次条件：田中さんは最大5日、山田さんは多め
  await page.goto(`${shiftUrl}?tab=conditions`);
  await page.getByLabel("田中 健 最大日数").fill("5");
  await page.getByLabel("田中 健 メモ").fill("今月は少なめに調整");
  await page.getByLabel("山田 太郎 量").selectOption("MORE");
  await page.getByRole("button", { name: "条件を保存" }).click();
  await expect(page.getByText("月次条件を保存しました")).toBeVisible();

  // 自動作成
  await page.goto(`${shiftUrl}?tab=board`);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "自動作成（手動配置は残す）" }).click();
  await expect(page.getByText(/シフト案を作成しました/)).toBeVisible();
  await expect(page.getByText("自動作成レポート（作成時点）")).toBeVisible();

  // 田中さんは最大5日を超えない
  const tanakaDays = await page.locator("tr", { hasText: "田中 健" }).locator("td").nth(1).textContent();
  expect(Number(tanakaDays)).toBeLessThanOrEqual(5);

  // マスをタップして手動で配置を外す
  const yamadaCells = page.locator("tr", { hasText: "山田 太郎" }).getByRole("button");
  const before = Number(await page.locator("tr", { hasText: "山田 太郎" }).locator("td").nth(1).textContent());
  for (let i = 0; i < (await yamadaCells.count()); i++) {
    const text = (await yamadaCells.nth(i).textContent())?.trim();
    if (text === "早" || text === "遅") {
      await yamadaCells.nth(i).click();
      await page.getByRole("button", { name: "この日の配置を外す" }).click();
      break;
    }
  }
  await expect(page.locator("tr", { hasText: "山田 太郎" }).locator("td").nth(1)).toHaveText(String(before - 1));

  // 公開
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "確定して公開・通知" }).click();
  await expect(page.getByText(/公開しました。全員/)).toBeVisible();
  await expect(page.getByText("公開済み（最新の内容を通知済み）")).toBeVisible();
});

test("シフト枠・必要人数の画面", async ({ page }) => {
  await login(page);
  await page.goto("/admin/shifts/settings");
  await expect(page.getByRole("heading", { name: "シフト枠・必要人数" })).toBeVisible();
  await page.getByLabel("早番 土").fill("3");
  await page.getByRole("button", { name: "必要人数を保存" }).click();
  await expect(page.getByText("必要人数を保存しました")).toBeVisible();
});

test("Phase 4: 給与目安・分析の画面", async ({ page }) => {
  await login(page);
  await page.goto("/admin/payroll");
  await expect(page.getByRole("heading", { name: "給与目安" })).toBeVisible();
  await expect(page.getByText(/合計 [\d,]+円/)).toBeVisible();
  await page.goto("/admin/analytics");
  await expect(page.getByRole("heading", { name: "勤怠分析" })).toBeVisible();
  await expect(page.getByText("スタッフ別 実働時間（勤務日数・遅刻）")).toBeVisible();
});
