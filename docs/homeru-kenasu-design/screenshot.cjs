// デザイン変更後の確認用。スマホ(390px)・小さいスマホ(320px)・テレビ(1920x1080)で
// 全画面を撮り、はみ出しがないかを表示する。
//   使い方: node docs/homeru-kenasu-design/screenshot.cjs [出力フォルダ]
//   （Playwright が必要: npm i -D playwright && npx playwright install chromium）
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const out = path.resolve(process.argv[2] || path.join(__dirname, "after"));
const html = "file://" + path.resolve(__dirname, "../../public/homeru-kenasu.html");
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const problems = [];
  for (const [name, w, h] of [["phone", 390, 844], ["phone-small", 320, 640], ["tv", 1920, 1080]]) {
    const p = await browser.newPage({ viewport: { width: w, height: h } });
    p.on("pageerror", (e) => problems.push(`${name}: JSエラー ${e.message}`));
    await p.goto(html, { waitUntil: "networkidle" });
    const check = async (label, mustFit) => {
      const [sw, sh] = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]);
      if (sw > w) problems.push(`${name} ${label}: 横にはみ出し (${sw}px > ${w}px)`);
      if (mustFit && sh > h) problems.push(`${name} ${label}: 縦にはみ出し (${sh}px > ${h}px)`);
    };
    await p.screenshot({ path: `${out}/${name}-1title.png` });
    await check("タイトル", true);

    await p.click("#startBtn");
    // 全31語を順に出して、言葉がカードからはみ出さないか調べる
    const bad = await p.evaluate(() => {
      const r = [];
      for (const q of WORDS) {
        deck[0] = q; idx = 0; renderQuestion();
        const c = document.getElementById("wordcard");
        if (c.scrollWidth > c.clientWidth || document.documentElement.scrollWidth > innerWidth) r.push(q.word);
      }
      deck[0] = WORDS.find((x) => x.word === "красавчик"); renderQuestion();
      return r;
    });
    if (bad.length) problems.push(`${name}: カードからはみ出す単語 ${bad.join(", ")}`);
    await p.waitForTimeout(700);
    await p.screenshot({ path: `${out}/${name}-2question.png` });
    await check("問題", true);

    await p.click(".choice.mock");
    await p.waitForTimeout(400);
    await p.screenshot({ path: `${out}/${name}-3verdict.png` });
    await p.waitForTimeout(1500);
    await p.screenshot({ path: `${out}/${name}-4answer.png` });
    await check("答え", name !== "phone-small");

    for (let i = 1; i < 10; i++) { await p.click("#nextBtn"); await p.click(".choice.praise"); }
    await p.waitForTimeout(1400);
    await p.click("#nextBtn");
    await p.waitForTimeout(3600);
    await p.screenshot({ path: `${out}/${name}-5result.png`, fullPage: true });
    await check("結果", name === "tv");
    await p.close();
  }
  await browser.close();
  console.log(`スクショ: ${out}`);
  console.log(problems.length ? "問題あり:\n- " + problems.join("\n- ") : "問題なし（はみ出し・JSエラーなし）");
  process.exitCode = problems.length ? 1 : 0;
})();
