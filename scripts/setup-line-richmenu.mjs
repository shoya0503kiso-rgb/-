// LINE 公式アカウントにリッチメニュー（シフト提出／シフト確認／勤務時間／給与目安）を登録し、全員の既定にする。
// 使い方: LINE_CHANNEL_ACCESS_TOKEN=xxxx node scripts/setup-line-richmenu.mjs
// 各ボタンはそのテキストをトークに送信し、アプリのWebhookが返信する（docs/04-line.md）。
import { readFileSync } from "node:fs";

const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
if (!token) {
  console.error("LINE_CHANNEL_ACCESS_TOKEN を指定してください");
  process.exit(1);
}
const auth = { Authorization: `Bearer ${token}` };

async function call(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${url} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

const W = 2500;
const H = 843;
const labels = ["シフト提出", "シフト確認", "勤務時間", "給与目安"];
const width = W / labels.length;

const { richMenuId } = await call("https://api.line.me/v2/bot/richmenu", {
  method: "POST",
  headers: { ...auth, "Content-Type": "application/json" },
  body: JSON.stringify({
    size: { width: W, height: H },
    selected: true,
    name: "シフト管理くん",
    chatBarText: "メニュー",
    areas: labels.map((text, i) => ({
      bounds: { x: Math.round(i * width), y: 0, width: Math.round(width), height: H },
      action: { type: "message", label: text, text },
    })),
  }),
});
console.log("リッチメニューを作成:", richMenuId);

await call(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
  method: "POST",
  headers: { ...auth, "Content-Type": "image/png" },
  body: readFileSync(new URL("../assets/line/richmenu.png", import.meta.url)),
});
console.log("画像をアップロードしました");

await call(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, { method: "POST", headers: auth });
console.log("全員の既定のリッチメニューに設定しました");
