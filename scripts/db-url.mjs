// 接続文字列の整形（src/lib/db-url.ts と同じ処理。ビルド用スクリプトから使う）
// Neon からそのまま貼った値でも動くようにする：
//   - `psql '...'` や `DATABASE_URL=...`、前後の引用符・空白を取り除く
//   - プール経由（ホスト名に -pooler）なら pgbouncer=true&connection_limit=1 を自動で付ける
//   - DIRECT_URL が未設定なら、プール経由のURLから直接接続のURLを作る（-pooler を外す）
export function cleanDbUrl(raw) {
  let s = (raw ?? "").trim();
  s = s.replace(/^(export\s+)?[A-Z_]+=/, "").trim();
  s = s.replace(/^psql\s+/, "").trim();
  s = s.replace(/^['"]|['"]$/g, "").trim();
  return s;
}

export function isPostgres(url) {
  return /^postgres(ql)?:\/\//.test(url);
}

export function normalizeDbUrls(env) {
  const databaseUrl = cleanDbUrl(env.DATABASE_URL);
  if (!isPostgres(databaseUrl)) return { databaseUrl, directUrl: cleanDbUrl(env.DIRECT_URL) || undefined };
  const u = new URL(databaseUrl);
  const pooled = u.hostname.includes("-pooler");
  if (pooled) {
    if (!u.searchParams.has("pgbouncer")) u.searchParams.set("pgbouncer", "true");
    if (!u.searchParams.has("connection_limit")) u.searchParams.set("connection_limit", "1");
  }
  let directUrl = cleanDbUrl(env.DIRECT_URL);
  if (!directUrl) {
    const d = new URL(databaseUrl);
    d.hostname = d.hostname.replace("-pooler", "");
    d.searchParams.delete("pgbouncer");
    d.searchParams.delete("connection_limit");
    directUrl = d.toString();
  }
  return { databaseUrl: u.toString(), directUrl };
}
