// 本番（PostgreSQL）用に prisma/schema.prisma の provider を切り替える。
// 使い方: node scripts/use-postgres.mjs  （元に戻す: node scripts/use-postgres.mjs --sqlite）
import { readFileSync, writeFileSync } from "node:fs";

const path = new URL("../prisma/schema.prisma", import.meta.url);
const to = process.argv.includes("--sqlite") ? "sqlite" : "postgresql";
const src = readFileSync(path, "utf8");
const out = src.replace(/(datasource db \{\s*provider\s*=\s*)"(sqlite|postgresql)"/, `$1"${to}"`);
writeFileSync(path, out);
console.log(`provider = "${to}"`);
