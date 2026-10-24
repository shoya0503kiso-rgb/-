// ダミー素材（仮の色付き動画・キャラ画像・BGM）を ffmpeg で作るスクリプト
// 使い方: npm run dummy        （既にあるファイルは上書きしない）
//         npm run dummy -- --force （上書きする）
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assets = path.join(root, "assets");
const font = path.join(assets, "fonts", "DelaGothicOne-Regular.ttf");
const force = process.argv.includes("--force");
const data = JSON.parse(readFileSync(path.join(root, "players.json"), "utf8"));
const seconds = data.settings?.videoSeconds ?? 5;

// ffmpeg の drawtext 用にエスケープ
const esc = (s) => s.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\u2019").replace(/%/g, "\\%");
const ff = (args) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });

const COLORS = [
  ["0x8b0000", "0x1a0000"],
  ["0x00336b", "0x000814"],
  ["0x5b2a86", "0x12001f"],
  ["0x0b6e4f", "0x001a10"],
  ["0x9a6200", "0x1f1300"],
  ["0x7a003c", "0x1a000c"],
  ["0x00616b", "0x001417"],
  ["0x4a4a4a", "0x0a0a0a"],
  ["0xa8001f", "0x200006"],
];

for (const dir of ["videos", "images", "bgm"]) mkdirSync(path.join(assets, dir), { recursive: true });

data.players.forEach((p, i) => {
  const [c1, c2] = COLORS[i % COLORS.length];
  const label = esc(`PLAYER ${i + 1}`);
  const name = esc(p.name);

  const videoPath = path.join(assets, "videos", p.video);
  if (force || !existsSync(videoPath)) {
    console.log(`動画: ${p.video}`);
    ff([
      "-f", "lavfi", "-i", `gradients=s=1080x1920:c0=${c1}:c1=${c2}:x0=0:y0=0:x1=1080:y1=1920:speed=0.03:d=${seconds}:r=30`,
      "-f", "lavfi", "-i", `anullsrc=r=48000:cl=stereo`,
      "-vf", [
        `drawtext=fontfile='${font}':text='${label}':fontsize=130:fontcolor=white:x=(w-tw)/2:y=h*0.36`,
        `drawtext=fontfile='${font}':text='${name}':fontsize=110:fontcolor=0xF5D27A:x=(w-tw)/2:y=h*0.46`,
        `drawtext=fontfile='${font}':text='DUMMY VIDEO':fontsize=60:fontcolor=white@0.6:x=(w-tw)/2:y=h*0.56`,
        `drawtext=fontfile='${font}':text='%{eif\\:${seconds}-t\\:d}':fontsize=260:fontcolor=white@0.25:x=(w-tw)/2:y=h*0.66`,
        `drawbox=x=0:y=ih*0.9+mod(t*400\\,ih*0.1):w=iw:h=8:color=white@0.3:t=fill`,
      ].join(","),
      "-t", String(seconds), "-shortest",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "32", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "32k", videoPath,
    ]);
  }

  const imagePath = path.join(assets, "images", p.image);
  if (force || !existsSync(imagePath)) {
    console.log(`画像: ${p.image}`);
    // 人型シルエット（頭＝円、体＝楕円）をグラデ背景に描く
    const sil =
      "if(lt(hypot(X-512\\,Y-560)\\,190)+lt(hypot((X-512)/330\\,(Y-1250)/430)\\,1)\\,20\\,";
    ff([
      "-f", "lavfi", "-i", `gradients=s=1024x1536:c0=${c1}:c1=${c2}:x0=512:y0=300:x1=512:y1=1536:d=1`,
      "-frames:v", "1",
      "-vf", [
        "format=rgb24",
        `geq=r='${sil}r(X\\,Y))':g='${sil}g(X\\,Y))':b='${sil}b(X\\,Y))'`,
        `drawtext=fontfile='${font}':text='${name}':fontsize=120:fontcolor=0xF5D27A:borderw=6:bordercolor=black:x=(w-tw)/2:y=120`,
        `drawtext=fontfile='${font}':text='CHARACTER (DUMMY)':fontsize=48:fontcolor=white@0.7:x=(w-tw)/2:y=h-120`,
      ].join(","),
      imagePath,
    ]);
  }
});

const bgmPath = path.join(assets, "bgm", "dummy-bgm.mp3");
if (force || !existsSync(bgmPath)) {
  console.log("BGM: dummy-bgm.mp3");
  // 128BPM の簡単なキック＋ベース＋ハイハットのループ（8小節）
  const b = 60 / 128;
  const kick = `0.9*sin(2*PI*(45+90*exp(-mod(t\\,${b})*30))*mod(t\\,${b}))*exp(-mod(t\\,${b})*9)`;
  const bass = `0.25*sin(2*PI*if(lt(mod(t\\,${b * 8})\\,${b * 4})\\,55\\,41.2)*t)*(1-exp(-mod(t+${b / 2}\\,${b})*40))*exp(-mod(t+${b / 2}\\,${b})*4)`;
  const hat = `0.08*(random(0)*2-1)*exp(-mod(t+${b / 2}\\,${b})*60)`;
  ff([
    "-f", "lavfi", "-i", `aevalsrc='${kick}+${bass}+${hat}':s=44100:d=${(b * 32).toFixed(4)}`,
    "-af", "volume=0.8,alimiter",
    "-c:a", "libmp3lame", "-b:a", "128k", bgmPath,
  ]);
}

console.log("ダミー素材の作成が完了しました。");
