// パートごとに書き出してつなげる高速書き出し。
// 一度書き出したパートは out/cache/ に保存され、内容が変わっていなければ使い回す。
// 本人動画パートは持ち点に関係ないので、持ち点が決まる前に作り置きできる。
//
//   npm run prerender                 … 全員分の本人動画パートだけ先に作る（縦型）
//   npm run fast                      … 縦型を書き出す（作り置きがあれば速い）
//   npm run fast -- --horizontal      … 横型
//   --browser=<Chrome/Chromium のパス> … 使うブラウザを指定（任意）
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assets = path.join(root, "assets");
const argv = process.argv.slice(2);
const orientation = argv.includes("--horizontal") ? "horizontal" : "vertical";
const prerenderOnly = argv.includes("--prerender");
const browserExecutable = argv.find((a) => a.startsWith("--browser="))?.slice(10) || process.env.REMOTION_BROWSER || null;
const FPS = 30;
const concurrency = Number(argv.find((a) => a.startsWith("--concurrency="))?.slice(14)) || os.cpus().length;

execFileSync("node", [path.join(root, "scripts", "check.mjs")], { stdio: "inherit" });
const data = JSON.parse(readFileSync(path.join(root, "players.json"), "utf8"));

// ---- 紹介順（src/timeline.ts と同じルール） ----
const byChipsDesc = (a, b) => b.chips - a.chips || (a.seat ?? 99) - (b.seat ?? 99);
const order = [...data.players].sort(byChipsDesc).reverse();

// ---- キャッシュのキー：ソースコード＋そのパートに関係するデータ＋素材ファイル ----
const hashFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile())
    .map((e) => path.join(e.parentPath ?? e.path, e.name))
    .sort()
    .map((f) => readFileSync(f))
    .reduce((h, buf) => h.update(buf), createHash("sha1"))
    .digest("hex");
const codeHash = hashFiles(path.join(root, "src"));
const fileStamp = (rel) => {
  const f = path.join(assets, rel);
  return existsSync(f) ? `${statSync(f).size}-${statSync(f).mtimeMs}` : "none";
};
const keyOf = (props, files) =>
  createHash("sha1").update(JSON.stringify({ codeHash, props, files: files.map(fileStamp) })).digest("hex").slice(0, 16);

const settingsForParts = {
  videoSeconds: data.settings?.videoSeconds,
  videoVolume: data.settings?.videoVolume,
  videoZoom: data.settings?.videoZoom,
  transition: data.settings?.transition,
};
const imageRel = (p) => (p.image ? `images/${p.image}` : `images/_auto/${p.video.replace(/\.[^.]+$/, "")}.jpg`);

/** 本人動画パートは、その人の名前・動画と大会名だけで決まる（持ち点は無関係） */
const videoPart = (p) => ({
  part: "video",
  playerName: p.name,
  data: {
    tournament: { ...data.tournament },
    settings: settingsForParts,
    players: [{ name: p.name, chips: 0, video: p.video, videoSeconds: p.videoSeconds, videoZoom: p.videoZoom, videoFocusX: p.videoFocusX }],
  },
  files: [`videos/${p.video}`],
});
const fullData = { tournament: data.tournament, settings: settingsForParts, players: data.players };
const allImages = data.players.map(imageRel);

const parts = [];
if (prerenderOnly) {
  for (const p of data.players) parts.push(videoPart(p));
} else {
  parts.push({
    part: "opening",
    data: { tournament: data.tournament, settings: {}, players: data.players.map((_, i) => ({ name: `#${i}`, chips: 0, video: "" })) },
    files: [],
  });
  order.forEach((p, i) => {
    const isLeader = i === order.length - 1;
    if (isLeader) parts.push({ part: "leaderIntro", playerName: p.name, data: fullData, files: [imageRel(p)] });
    parts.push(videoPart(p));
    parts.push({ part: "reveal", playerName: p.name, data: fullData, files: [imageRel(p)] });
  });
  parts.push({ part: "ending", data: fullData, files: allImages });
}

// ---- 書き出し ----
const cacheDir = path.join(root, "out", "cache", orientation);
mkdirSync(cacheDir, { recursive: true });

const todo = parts.map((p) => {
  const inputProps = { part: p.part, orientation, data: p.data, playerName: p.playerName };
  const key = keyOf(inputProps, p.files);
  return { ...p, inputProps, file: path.join(cacheDir, `${p.part}-${key}.mp4`) };
});
const missing = todo.filter((t) => !existsSync(t.file));
console.log(`パート ${todo.length} 個（作り置きあり ${todo.length - missing.length} / これから書き出す ${missing.length}）`);

if (missing.length > 0) {
  console.log("準備中…");
  const serveUrl = await bundle({ entryPoint: path.join(root, "src", "index.ts"), publicDir: assets });
  let n = 0;
  for (const t of missing) {
    n++;
    const label = `${n}/${missing.length} ${t.part}${t.playerName ? `（${t.playerName}）` : ""}`;
    const composition = await selectComposition({ serveUrl, id: "Segment", inputProps: t.inputProps, browserExecutable });
    let last = -1;
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      crf: 18,
      imageFormat: "jpeg",
      jpegQuality: 92,
      pixelFormat: "yuv420p",
      audioCodec: "aac",
      enforceAudioTrack: true,
      inputProps: t.inputProps,
      outputLocation: `${t.file}.tmp.mp4`,
      browserExecutable,
      concurrency,
      onProgress: ({ progress }) => {
        const pct = Math.floor(progress * 10) * 10;
        if (pct !== last) {
          last = pct;
          process.stdout.write(`\r書き出し中 ${label} ${pct}%   `);
        }
      },
    });
    renameSync(`${t.file}.tmp.mp4`, t.file);
    process.stdout.write("\n");
  }
}

if (prerenderOnly) {
  console.log("✔ 本人動画パートの作り置きが完了しました。持ち点が決まったら npm run fast で書き出せます。");
  process.exit(0);
}

// ---- つなげる＋BGM ----
const ff = (args) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
const listFile = path.join(cacheDir, "concat.txt");
writeFileSync(listFile, todo.map((t) => `file '${t.file.replace(/'/g, "'\\''")}'`).join("\n"));
const joined = path.join(cacheDir, "joined.mp4");
ff(["-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", joined]);

// 各パートの開始時刻（秒）
const durations = todo.map((t) => Number(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=nb_frames", "-of", "default=nw=1:nk=1", t.file]).toString().trim()) / FPS);
const starts = durations.reduce((acc, d, i) => [...acc, acc[i] + d], [0]);
const total = starts[starts.length - 1];

const outFile = path.join(root, "out", `ft-${orientation}.mp4`);
const s = data.settings ?? {};
if (s.bgm) {
  const vol = s.bgmVolume ?? 0.6;
  const duck = s.bgmVolumeDuringVideo ?? vol;
  // 本人動画の間だけBGMを下げる（前後 1/3 秒でなめらかに）
  const r = 1 / 3;
  const k = todo
    .map((t, i) => (t.part === "video" ? `clip((t-${(starts[i] - r).toFixed(3)})/${r.toFixed(3)},0,1)*clip((${(starts[i + 1] + r).toFixed(3)}-t)/${r.toFixed(3)},0,1)` : null))
    .filter(Boolean)
    .reduce((a, b) => (a ? `max(${a},${b})` : b), "");
  const volumeExpr = k ? `${vol}+(${duck - vol})*(${k})` : `${vol}`;
  ff([
    "-i", joined,
    "-stream_loop", "-1", "-i", path.join(assets, s.bgm),
    "-filter_complex",
    `[1:a]atrim=0:${total.toFixed(3)},aresample=48000,volume='${volumeExpr}':eval=frame,afade=t=out:st=${(total - 1.5).toFixed(3)}:d=1.5[b];` +
      `[0:a]aresample=48000:async=1000[v];[v][b]amix=inputs=2:normalize=0:duration=first[a]`,
    "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", total.toFixed(3), outFile,
  ]);
} else {
  ff(["-i", joined, "-c", "copy", outFile]);
}
console.log(`✔ 書き出し完了: out/ft-${orientation}.mp4（${total.toFixed(1)}秒）`);
