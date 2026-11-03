import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

export default function setup() {
  const file = process.env.TEST_DB_FILE ?? "test.db";
  execSync("npx prisma db push --force-reset --skip-generate", {
    env: { ...process.env, DATABASE_URL: `file:./${file}`, PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: "yes" },
    stdio: "ignore",
  });
  return () => {
    for (const f of [file, `${file}-journal`]) rmSync(path.join(__dirname, "..", "prisma", f), { force: true });
  };
}
