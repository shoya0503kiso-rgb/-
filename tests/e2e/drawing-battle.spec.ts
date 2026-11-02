import { expect, test, type Page } from "@playwright/test";

// お絵描きバトル：部屋作成 → QR/コードで参加 → 描いて提出 → 全員の画面でバトルが始まる
async function scribble(page: Page, color: number) {
  await page.locator(`#palette .swatch:nth-child(${color})`).click();
  const box = (await page.locator("#padCv").boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 40, box.y + box.height / 2, { steps: 8 });
  await page.mouse.move(box.x + 50, box.y + box.height - 40, { steps: 8 });
  await page.mouse.up();
}

test("2人で描いて提出すると、両方の画面で同じバトルが始まる", async ({ browser }) => {
  const host = await (await browser.newContext()).newPage();
  const guest = await (await browser.newContext()).newPage();
  await host.goto("/drawing-battle");
  await host.getByRole("button", { name: "部屋を作る（ホスト）" }).click();
  await expect(host.locator("#lobbyCode")).toHaveText(/^[A-Z0-9]{5}$/);
  const code = (await host.locator("#lobbyCode").textContent())!.trim();
  await expect(host.locator("#lobbyQr svg")).toBeVisible();

  await guest.goto("/drawing-battle");
  // スマホの日本語キーボードで全角・小文字で入れても、半角大文字に直して参加できる
  const wide = Array.from(code.toLowerCase(), (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0)).join("");
  await guest.locator("#codeInput").fill(wide);
  await expect(guest.locator("#codeInput")).toHaveValue(code);
  await guest.getByRole("button", { name: "参加" }).click();
  await expect(guest.locator("#waitHost")).toBeVisible();
  await expect(host.locator("#lobbyCount")).toHaveText("2 / 8人");

  await host.locator('#cpuSeg button[data-v="0"]').click();
  await expect(guest.locator("#planText")).toHaveText("2人で一発勝負");
  await host.getByRole("button", { name: "スタート！" }).click();
  await expect(host.locator("#countdown")).toBeHidden({ timeout: 8000 });

  // 何も描かずにOKは押せない
  await host.locator("#okBtn").click();
  await expect(host.locator("#toast")).toHaveText("何か描いてからOKを押してね");

  await scribble(host, 2);
  await host.locator("#nameInput").fill("ほのおくん");
  await host.locator("#okBtn").click();
  await expect(host.locator("#wait")).toBeVisible();
  await scribble(guest, 6);
  await guest.locator("#okBtn").click();

  for (const p of [host, guest]) {
    await expect(p.locator("#battle")).toBeVisible({ timeout: 10_000 });
    await expect(p.locator("#bracket")).toContainText("ほのおくん");
    await expect(p.locator("#nmA")).not.toBeEmpty({ timeout: 10_000 });
  }
  expect(await host.locator("#nmA").textContent()).toBe(await guest.locator("#nmA").textContent());
});
