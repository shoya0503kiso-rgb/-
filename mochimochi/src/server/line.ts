import "server-only";
import { UserError } from "./errors";

// LINE ログイン（LIFF）。公式LINE・LIFF アプリを作ったら環境変数を入れるだけで有効になる
//   NEXT_PUBLIC_LIFF_ID      … LIFF アプリの ID（画面側で liff.init に使う）
//   LINE_LOGIN_CHANNEL_ID    … LINE ログインチャネルの Channel ID（IDトークンの検証に使う）

export function lineLoginEnabled() {
  return !!(process.env.NEXT_PUBLIC_LIFF_ID && process.env.LINE_LOGIN_CHANNEL_ID);
}

export interface LineProfile {
  userId: string;
  name: string;
}

/** LIFF で取得した IDトークンを LINE のサーバーで検証する */
export async function verifyLineIdToken(idToken: string, fetchImpl: typeof fetch = fetch): Promise<LineProfile> {
  const clientId = process.env.LINE_LOGIN_CHANNEL_ID;
  if (!clientId) throw new UserError("LINE ログインはまだ設定されていません");
  const res = await fetchImpl("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: idToken, client_id: clientId }),
  });
  if (!res.ok) throw new UserError("LINE ログインを確認できませんでした。もう一度開き直してください");
  const data = (await res.json()) as { sub?: string; name?: string };
  if (!data.sub) throw new UserError("LINE ログインを確認できませんでした");
  return { userId: data.sub, name: data.name ?? "" };
}
