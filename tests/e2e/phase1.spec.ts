import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("ログインID").fill("admin");
  await page.getByLabel("パスワード").fill("admin1234");
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page.getByRole("heading", { name: "ダッシュボード" })).toBeVisible();
}

test("Phase 1: 従業員登録 → iPad打刻 → 勤怠確認 → 要確認 → 出力", async ({ page }) => {
  await login(page);

  // 従業員を追加
  await page.goto("/admin/employees/new");
  await page.getByLabel("名前（打刻画面に表示）").fill("テスト 次郎");
  await page.getByRole("button", { name: "登録" }).click();
  await expect(page.getByText("登録しました")).toBeVisible();

  // 打刻端末として登録
  await page.goto("/kiosk/setup");
  await page.getByRole("button", { name: "この端末を登録して打刻画面へ" }).click();
  await expect(page).toHaveURL(/\/kiosk$/);

  // 出勤（2タップ）
  await page.getByRole("button", { name: /テスト 次郎/ }).click();
  await page.getByRole("button", { name: "出勤", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("出勤しました");
  await page.getByRole("status").click();
  await expect(page.getByRole("button", { name: /テスト 次郎.*勤務中/ })).toBeVisible();

  // 二重出勤はできない（勤務中は休憩開始/退勤だけ表示）
  await page.getByRole("button", { name: /テスト 次郎/ }).click();
  await expect(page.getByRole("button", { name: "出勤", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "休憩開始" }).click();
  await expect(page.getByRole("status")).toContainText("休憩開始しました");
  await page.getByRole("status").click();

  // 休憩中のまま退勤 → 休憩も終了
  await page.getByRole("button", { name: /テスト 次郎/ }).click();
  await page.getByRole("button", { name: "退勤", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("休憩も終了しました");
  await page.getByRole("status").click();

  // 打刻端末には管理者ログインが残らない
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login/);
  await login(page);

  // ダッシュボードに要確認が出る（休憩終了押し忘れ・短すぎる勤務）
  await page.goto("/admin");
  await expect(page.getByText(/要確認勤怠 \d+件/).first()).toBeVisible();

  await page.goto("/admin/anomalies");
  await expect(page.getByText("休憩終了を押さずに退勤")).toBeVisible();
  await page.locator("table").getByRole("link", { name: /\d+\/\d+\(.\)/ }).first().click();
  await expect(page.getByRole("heading", { name: /テスト 次郎/ })).toBeVisible();

  // 確認済みにする
  page.on("dialog", (d) => d.accept("本人に確認済み"));
  const ackButtons = page.getByRole("button", { name: "確認済みにする" });
  for (let n = await ackButtons.count(); n > 0; n--) {
    await ackButtons.first().click();
    await expect(ackButtons).toHaveCount(n - 1);
  }

  // 修正（理由必須）
  await page.getByRole("button", { name: "修正を保存" }).click();
  await expect(page.getByText("修正理由を入力してください")).toBeVisible();

  // 月次勤怠
  await page.getByRole("link", { name: "← 月次勤怠に戻る" }).click();
  await expect(page.getByRole("heading", { name: "テスト 次郎さんの勤怠" })).toBeVisible();
  await expect(page.getByText("総勤務日数")).toBeVisible();

  // CSV 出力
  const ym = new URL(page.url()).searchParams.get("ym");
  const res = await page.request.get(`/api/admin/export?ym=${ym}&format=csv`);
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain("テスト 次郎");
});

test("未ログインでは管理画面・出力APIに入れない", async ({ page }) => {
  await page.goto("/admin/attendance");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fattendance/);
  const res = await page.request.get("/api/admin/export?ym=2026-10");
  expect(res.status()).toBe(401);
});

test("未登録端末では打刻できない", async ({ page }) => {
  await page.goto("/kiosk");
  await expect(page.getByText("打刻端末として登録されていません")).toBeVisible();
});
