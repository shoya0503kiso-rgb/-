// 撮った動画（iPhone の .MOV など）を、書き出しやすい mp4 に変換して assets/videos/ に入れる。
// 頭から必要な秒数だけ切り出し、1080p・30fps・H.264 にそろえる（4K/HEVC のままより書き出しがずっと速い）。
//
//   npm run import -- <動画が入ったフォルダ>   … フォルダ内の動画を全部変換（ファイル名 = 名前）
//   npm run import -- --drive                   … import/drive-files.json の Google ドライブの動画をダウンロードして変換
//                                                  （フォルダを「リンクを知っている全員」に共有しておく）
// 変換後、players.json に未登録の人は自動で追加する（持ち点は仮の 0）。
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const videosDir = path.join(root, "assets", "videos");
const srcDir = path.join(root, "import", "src");
const argv = process.argv.slice(2);
const force = argv.includes("--force");
const playersPath = path.join(root, "players.json");
const data = JSON.parse(readFileSync(playersPath, "utf8"));
const seconds = Math.max(...[data.settings?.videoSeconds ?? 5, ...data.players.map((p) => p.videoSeconds ?? 0)]) + 1;

const VIDEO_EXT = /\.(mov|mp4|m4v|avi|mkv|webm)$/i;
let sources = []; // { name, file }

if (argv.includes("--drive")) {
  const list = JSON.parse(readFileSync(path.join(root, "import", "drive-files.json"), "utf8"));
  mkdirSync(srcDir, { recursive: true });
  for (const f of list.files) {
    const dest = path.join(srcDir, f.file);
    if (!existsSync(dest) || force) {
      console.log(`ダウンロード: ${f.file}`);
      const url = `https://drive.usercontent.google.com/download?id=${f.id}&export=download&confirm=t`;
      execFileSync("curl", ["-sSfL", "--retry", "3", "-o", `${dest}.part`, url], { stdio: "inherit" });
      const head = readFileSync(`${dest}.part`).subarray(0, 200).toString("latin1");
      if (/<html/i.test(head)) {
        throw new Error(`${f.file}: 動画ではなくWebページが返ってきました。ドライブのフォルダを「リンクを知っている全員」に共有してください`);
      }
      execFileSync("mv", [`${dest}.part`, dest]);
    }
    sources.push({ name: f.name, file: dest });
  }
} else {
  const dir = argv.find((a) => !a.startsWith("--"));
  if (!dir) {
    console.error("使い方: npm run import -- <動画フォルダ>   または   npm run import -- --drive");
    process.exit(1);
  }
  sources = readdirSync(dir)
    .filter((f) => VIDEO_EXT.test(f))
    .map((f) => ({ name: path.parse(f).name.normalize("NFC"), file: path.join(dir, f) }));
}

mkdirSync(videosDir, { recursive: true });
for (const s of sources) {
  const out = path.join(videosDir, `${s.name}.mp4`);
  if (existsSync(out) && !force && statSync(out).mtimeMs >= statSync(s.file).mtimeMs) {
    console.log(`変換済み: ${s.name}`);
    continue;
  }
  console.log(`変換: ${s.name}`);
  // 縦長は 1080x1920 以内、横長は 1920x1080 以内に収める（回転情報は ffmpeg が自動で反映）
  execFileSync(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", s.file, "-t", String(seconds),
      "-vf", "scale='if(gt(iw,ih),min(1920,iw),-2)':'if(gt(iw,ih),-2,min(1920,ih))',fps=30,format=yuv420p",
      "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-g", "15",
      "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2",
      "-movflags", "+faststart",
      out,
    ],
    { stdio: "inherit" },
  );

  if (!data.players.some((p) => p.name === s.name)) {
    data.players.push({ name: s.name, title: "", chips: 0, video: `${s.name}.mp4` });
    console.log(`  → players.json に ${s.name} を追加（持ち点は仮の 0）`);
  }
}

writeFileSync(playersPath, JSON.stringify(data, null, 2) + "\n");
console.log("✔ 取り込み完了");
