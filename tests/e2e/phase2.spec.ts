import { createHmac } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("ログインID").fill("admin");
  await page.getByLabel("パスワード").fill("admin1234");
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page.getByRole("heading", { name: "ダッシュボード" })).toBeVisible();
}

test("Phase 2: LINE連携 → 受付開始 → スタッフがリンクから提出 → 提出状況に反映", async ({ page, browser }) => {
  await login(page);

  // 連携コードを発行し、LINE Webhook（署名付き）でコードを送る
  await page.goto("/admin/employees");
  await page.getByRole("link", { name: "佐藤 花子" }).click();
  await page.getByRole("button", { name: "連携コードを発行" }).click();
  const code = (await page.locator(".tracking-\\[0\\.3em\\]").textContent())!.trim();
  expect(code).toMatch(/^\d{6}$/);

  const body = JSON.stringify({
    events: [{ type: "message", replyToken: "r1", source: { type: "user", userId: "U-e2e-sato" }, message: { type: "text", text: code } }],
  });
  const sig = createHmac("sha256", "e2e-line-secret").update(body).digest("base64");
  const bad = await page.request.post("/api/line/webhook", { data: body, headers: { "content-type": "application/json", "x-line-signature": "bad" } });
  expect(bad.status()).toBe(401);
  const ok = await page.request.post("/api/line/webhook", { data: body, headers: { "content-type": "application/json", "x-line-signature": sig } });
  expect(ok.status()).toBe(200);
  await page.reload();
  await expect(page.getByText("連携済み")).toBeVisible();

  // 翌月のシフト受付を開始（提出依頼を送信）
  await page.goto("/admin/shifts");
  await page.getByRole("link", { name: /のシフト$/ }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "受付開始（提出依頼を送信）" }).click();
  await expect(page.getByText(/受付を開始しました/)).toBeVisible();

  // 通知履歴から佐藤さん宛の提出リンクを取り出す
  await page.goto("/admin/line");
  const row = page.locator("tr", { hasText: "佐藤 花子" }).filter({ hasText: "提出依頼" });
  await expect(row.getByText("送信済")).toBeVisible();
  const text = await row.locator("pre").textContent();
  const url = /http:\/\/localhost:3100(\/s\/\S+)/.exec(text!)![1];

  // スタッフのスマホ（未ログイン）で提出
  const staff = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await staff.goto(url);
  await expect(staff.getByText("佐藤 花子さん")).toBeVisible();
  await staff.getByRole("button", { name: "全部×" }).click();
  await staff.getByRole("button", { name: /\(.\) 出勤可/ }).nth(2).click();
  await staff.getByRole("button", { name: /\(.\) 出勤可/ }).nth(5).click();
  await expect(staff.getByText("出勤可 2 日")).toBeVisible();
  await staff.getByRole("button", { name: "提出する" }).click();
  await expect(staff.getByText(/提出しました（出勤可 2日）/)).toBeVisible();
  await staff.close();

  // 管理画面に反映
  await page.goto("/admin/shifts");
  await page.getByRole("link", { name: /のシフト$/ }).click();
  const r = page.locator("tr", { hasText: "佐藤 花子" });
  await expect(r.getByText("提出済")).toBeVisible();
  await expect(r.getByText("2日")).toBeVisible();

  // 改ざんしたリンクは使えない
  const tampered = await page.request.get(url.slice(0, -3) + "abc");
  expect(await tampered.text()).toContain("有効期限が切れているか");
});

test("cron は秘密キーなしでは実行できない", async ({ request }) => {
  expect((await request.get("/api/cron/daily")).status()).toBe(401);
  const r = await request.get("/api/cron/daily", { headers: { authorization: "Bearer e2e-cron" } });
  expect(r.status()).toBe(200);
});
