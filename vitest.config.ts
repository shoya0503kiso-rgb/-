import { defineConfig } from "vitest/config";
import path from "node:path";

// 実行ごとに別のDBファイルを使う（同時に複数のテストを走らせても衝突しない）
const dbFile = `test-${process.pid}.db`;
process.env.TEST_DB_FILE = dbFile;

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/service/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    env: { DATABASE_URL: `file:./${dbFile}?connection_limit=1`, SESSION_SECRET: "test-secret-test-secret-test-secret-123", TZ: "UTC" },
    fileParallelism: false,
  },
});
