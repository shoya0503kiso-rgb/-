// prisma/schema.prisma の provider を接続先に合わせて切り替える（ビルド前に自動実行）。
//   DATABASE_URL が postgres:// / postgresql:// なら PostgreSQL 用（接続プール用の directUrl も追加）
//   それ以外（file:）なら SQLite のまま。リポジトリには SQLite 版をコミットしておく。
// 明示指定: node scripts/use-postgres.mjs --postgres | --sqlite
import { readFileSync, writeFileSync } from "node:fs";

const path = new URL("../prisma/schema.prisma", import.meta.url);
const url = process.env.DATABASE_URL ?? "";
const pg = process.argv.includes("--postgres") || (!process.argv.includes("--sqlite") && /^postgres(ql)?:\/\//.test(url));

const src = readFileSync(path, "utf8");
const block = pg
  ? 'datasource db {\n  provider  = "postgresql"\n  url       = env("DATABASE_URL")\n  directUrl = env("DIRECT_URL")\n}'
  : 'datasource db {\n  provider = "sqlite"\n  url      = env("DATABASE_URL")\n}';
const out = src.replace(/datasource db \{[^}]*\}/, block);
if (out !== src) writeFileSync(path, out);
console.log(`prisma provider: ${pg ? "postgresql" : "sqlite"}`);
