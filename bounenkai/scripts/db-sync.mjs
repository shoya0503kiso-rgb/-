// ビルド時に本番DB（PostgreSQL）のテーブルをスキーマに合わせる。
// SQLite（ローカル・CI）では何もしない。データが消える変更は prisma が拒否するので、その場合はビルドが止まる。
import { execSync } from "node:child_process";
import { isPostgres, normalizeDbUrls } from "./db-url.mjs";

const { databaseUrl, directUrl } = normalizeDbUrls(process.env);
if (!isPostgres(databaseUrl)) {
  console.log("db-sync: PostgreSQL ではないためスキップ");
  process.exit(0);
}
execSync("npx prisma db push --skip-generate", {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: directUrl },
});
console.log("db-sync: テーブルをスキーマに合わせました");
