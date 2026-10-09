import { execSync } from "node:child_process";

export default function setup() {
  const env = { ...process.env, DATABASE_URL: "file:./e2e.db", PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: "yes" };
  execSync("npx prisma db push --force-reset --skip-generate", { env, stdio: "ignore" });
  execSync("npx tsx prisma/seed.ts", { env: { ...env, SEED_DEMO: "1" }, stdio: "ignore" });
}
