import { NextResponse, type NextRequest } from "next/server";
import { getProfileName, reply, text, verifySignature } from "@/server/line/client";
import { HELP_TEXT, handleText } from "@/server/line/commands";

interface LineEvent {
  type: string;
  replyToken?: string;
  source?: { type: string; userId?: string };
  message?: { type: string; text?: string };
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("x-line-signature"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  let events: LineEvent[] = [];
  try {
    events = (JSON.parse(raw) as { events?: LineEvent[] }).events ?? [];
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  for (const ev of events) {
    const userId = ev.source?.type === "user" ? ev.source.userId : undefined;
    if (!userId || !ev.replyToken) continue;
    try {
      if (ev.type === "follow") {
        await reply(ev.replyToken, [text(`友だち追加ありがとうございます！\n\n${HELP_TEXT}`)]);
      } else if (ev.type === "message" && ev.message?.type === "text" && ev.message.text) {
        const name = /^\s*[0-9０-９]{6}\s*$/.test(ev.message.text) ? await getProfileName(userId) : "";
        await reply(ev.replyToken, [text(await handleText(userId, ev.message.text, name))]);
      } else if (ev.type === "message") {
        await reply(ev.replyToken, [text(HELP_TEXT)]);
      }
    } catch (e) {
      // 1件の失敗で他のイベントを止めない。LINE には 200 を返す（再送ループを防ぐ）
      console.error("LINE webhook event failed", e);
    }
  }
  return NextResponse.json({ ok: true });
}
