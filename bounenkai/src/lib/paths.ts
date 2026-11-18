/** ログイン後などの戻り先として安全なパスか（同一オリジンの相対パスのみ） */
export function safeNextPath(next: string, fallback = "/admin"): string {
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  try {
    const u = new URL(next, "http://local.invalid");
    if (u.origin !== "http://local.invalid") return fallback;
    return u.pathname + u.search;
  } catch {
    return fallback;
  }
}

/**
 * LINE（LIFF）で https://liff.line.me/<LIFF ID>/checkin?c=… を開くと、
 * まずトップ https://<URL>/?liff.state=%2Fcheckin%3Fc%3D… が開く。その行き先を返す
 */
export function liffStateTarget(state: string | undefined): string {
  return safeNextPath(state ?? "", "/me");
}
