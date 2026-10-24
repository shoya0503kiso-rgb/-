// players.json と素材ファイルのチェック（書き出し前に自動で実行される）
// 使い方: npm run check
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assets = path.join(root, "assets");
const errors = [];
const warnings = [];

let data;
try {
  data = JSON.parse(readFileSync(path.join(root, "players.json"), "utf8"));
} catch (e) {
  console.error(`✖ players.json が読めません（カンマの付け忘れ・付けすぎ、" の閉じ忘れなどを確認）\n  ${e.message}`);
  process.exit(1);
}

const t = data.tournament ?? {};
for (const key of ["store", "title", "date"]) if (!t[key]) errors.push(`tournament.${key} が空です`);

const players = Array.isArray(data.players) ? data.players : [];
if (players.length === 0) errors.push("players が1人もいません");

const hasFfprobe = (() => {
  try {
    execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

const defaultSeconds = data.settings?.videoSeconds ?? 5;
players.forEach((p, i) => {
  const who = `players[${i}]（${p.name ?? "名前なし"}）`;
  if (!p.name) errors.push(`${who}: name がありません`);
  if (typeof p.chips !== "number" || !Number.isFinite(p.chips)) errors.push(`${who}: chips は数字で書いてください（例: 125000。"" やカンマは不要）`);
  for (const [key, dir] of [["video", "videos"], ["image", "images"]]) {
    if (key === "image" && !p.image) continue; // 画像なし → 下で動画から切り出す
    if (!p[key]) {
      errors.push(`${who}: ${key} がありません`);
      continue;
    }
    const file = path.join(assets, dir, p[key]);
    if (!existsSync(file)) errors.push(`${who}: assets/${dir}/${p[key]} が見つかりません（ファイル名・拡張子・大文字小文字を確認）`);
    else if (key === "video" && hasFfprobe) {
      const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim();
      const need = p.videoSeconds ?? defaultSeconds;
      if (Number(out) + 0.05 < need) warnings.push(`${who}: 動画が ${Number(out).toFixed(1)} 秒しかありません（${need} 秒使う設定）。足りない分は最後のコマで止まります`);
    }
  }
});

// image を省略した人は、本人動画の真ん中あたりの1コマを画像として使う
const autoDir = path.join(assets, "images", "_auto");
for (const p of players) {
  if (p.image || !p.video) continue;
  const src = path.join(assets, "videos", p.video);
  const out = path.join(autoDir, `${p.video.replace(/\.[^.]+$/, "")}.jpg`);
  if (!existsSync(src)) continue;
  if (existsSync(out) && statSync(out).mtimeMs >= statSync(src).mtimeMs) continue;
  try {
    mkdirSync(autoDir, { recursive: true });
    const sec = Math.min(2.5, (p.videoSeconds ?? defaultSeconds) / 2);
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(sec), "-i", src, "-frames:v", "1", "-q:v", "2", out]);
    console.log(`・${p.name}: 画像がないので動画から切り出しました（assets/images/_auto/）`);
  } catch {
    errors.push(`${p.name}: image がなく、動画からの切り出しにも失敗しました（ffmpeg が必要）。image を指定してください`);
  }
}

const seats = players.map((p) => p.seat).filter((s) => s != null);
if (new Set(seats).size !== seats.length) warnings.push("席番号が重複しています");

const bgm = data.settings?.bgm;
if (bgm && !existsSync(path.join(assets, bgm))) errors.push(`settings.bgm: assets/${bgm} が見つかりません（BGMなしにするなら null）`);

for (const w of warnings) console.warn(`⚠ ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`✖ ${e}`);
  process.exit(1);
}
console.log(`✔ チェックOK（${players.length}人）`);
