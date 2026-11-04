// artifacts/lucky-hour.html（claude.ai の Artifact として公開している本体）を、
// このアプリの /lucky-hour で開ける完全なHTML（public/lucky-hour.html）に包み直す。
// 本体を直したら `node scripts/sync-lucky-hour.mjs` を実行して両方をコミットする（ビルド時にも自動で実行）
import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync(new URL("../artifacts/lucky-hour.html", import.meta.url), "utf8");
const head = '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
  + '<style>:root{box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;padding:0}img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>\n';
const note = "<!-- 自動生成：artifacts/lucky-hour.html を直して scripts/sync-lucky-hour.mjs を実行 -->\n";
const out = head + note + src + "\n</body></html>\n";
writeFileSync(new URL("../public/lucky-hour.html", import.meta.url), out);
console.log("sync-lucky-hour: public/lucky-hour.html を更新しました");
