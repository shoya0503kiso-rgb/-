import "server-only";
// 通知の送信。LINE は公式アカウントの Messaging API（プッシュメッセージ）。LINE Notify は終了済みなので使わない。
// メールは Resend の HTTP API。どちらも未設定なら送らずに NotificationLog にだけ残す（mock）。
import { prisma } from "./db";

async function log(data: { channel: string; to: string; body: string; status: string; error?: string; reservationId?: string }) {
  await prisma.notificationLog.create({ data: { ...data, error: data.error ?? "" } }).catch((e) => console.error(e));
}

export async function sendLinePush(text: string, reservationId?: string) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
  const toList = (process.env.LINE_NOTIFY_TO ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!token || toList.length === 0) {
    await log({ channel: "line", to: toList.join(","), body: text, status: "mock", reservationId });
    return;
  }
  for (const to of toList) {
    try {
      const res = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ to, messages: [{ type: "text", text: text.slice(0, 5000) }] }),
      });
      if (!res.ok) throw new Error(`LINE ${res.status}: ${(await res.text()).slice(0, 300)}`);
      await log({ channel: "line", to, body: text, status: "sent", reservationId });
    } catch (e) {
      console.error(e);
      await log({ channel: "line", to, body: text, status: "failed", error: String(e), reservationId });
    }
  }
}

export async function sendMail(to: string, subject: string, text: string, reservationId?: string): Promise<"sent" | "mock" | "failed"> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.MAIL_FROM?.trim();
  const body = `件名：${subject}\n\n${text}`;
  if (!key || !from) {
    await log({ channel: "email", to, body, status: "mock", reservationId });
    return "mock";
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from, to: [to], subject, text }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
    await log({ channel: "email", to, body, status: "sent", reservationId });
    return "sent";
  } catch (e) {
    console.error(e);
    await log({ channel: "email", to, body, status: "failed", error: String(e), reservationId });
    return "failed";
  }
}
