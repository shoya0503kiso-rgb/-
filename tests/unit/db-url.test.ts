import { describe, expect, it } from "vitest";
import { normalizeDbUrls } from "@/lib/db-url";
// ビルド用スクリプト（.mjs）も同じ結果になることを確認する
import { normalizeDbUrls as normalizeMjs } from "../../scripts/db-url.mjs";

const pooled = "postgresql://u:p@ep-cool-123-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

describe("接続文字列の整形（Neon から貼ったままでも動く）", () => {
  it("プール経由には pgbouncer と connection_limit を付け、直接接続を自動で作る", () => {
    const r = normalizeDbUrls({ DATABASE_URL: pooled });
    expect(r.databaseUrl).toContain("pgbouncer=true");
    expect(r.databaseUrl).toContain("connection_limit=1");
    expect(r.databaseUrl).toContain("sslmode=require");
    expect(r.directUrl).toBe("postgresql://u:p@ep-cool-123.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require");
  });

  it("psql '...' や DATABASE_URL= 付き・引用符付きでも取り出せる", () => {
    for (const raw of [`psql '${pooled}'`, `DATABASE_URL="${pooled}"`, `  '${pooled}'  `]) {
      expect(normalizeDbUrls({ DATABASE_URL: raw }).databaseUrl.startsWith("postgresql://u:p@ep-cool-123-pooler")).toBe(true);
    }
  });

  it("既に付いている指定・DIRECT_URL・SQLite はそのまま", () => {
    const r = normalizeDbUrls({ DATABASE_URL: `${pooled}&pgbouncer=true&connection_limit=3`, DIRECT_URL: "postgresql://d" });
    expect(r.databaseUrl).toContain("connection_limit=3");
    expect(r.directUrl).toBe("postgresql://d");
    expect(normalizeDbUrls({ DATABASE_URL: "file:./dev.db" })).toEqual({ databaseUrl: "file:./dev.db", directUrl: undefined });
  });

  it("ビルド用スクリプトと同じ結果", () => {
    for (const env of [{ DATABASE_URL: pooled }, { DATABASE_URL: `psql '${pooled}'` }, { DATABASE_URL: "file:./x.db" }]) {
      expect(normalizeMjs(env)).toEqual(normalizeDbUrls(env));
    }
  });
});
