// ビルド時に本番DB（PostgreSQL）のテーブルをスキーマに合わせる。
// SQLite（ローカル・CI）では何もしない。データが消える変更は prisma が拒否するので、その場合はビルドが止まる。
import { execSync } from "node:child_process";

const url = process.env.DATABASE_URL ?? "";
if (!/^postgres(ql)?:\/\//.test(url)) {
  console.log("db-sync: PostgreSQL ではないためスキップ");
  process.exit(0);
}
if (!process.env.DIRECT_URL) {
  console.error("db-sync: DIRECT_URL（直接接続の接続文字列）を設定してください");
  process.exit(1);
}
execSync("npx prisma db push --skip-generate", { stdio: "inherit" });
console.log("db-sync: テーブルをスキーマに合わせました");
