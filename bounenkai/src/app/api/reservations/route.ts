import { NextResponse } from "next/server";
import { clientIp } from "@/server/auth";
import { UserError } from "@/server/errors";
import { createReservation } from "@/server/reservations";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "送信内容を読み取れませんでした" }, { status: 400 });
  }
  // ボット対策のダミー欄（人には見えない）。入っていたら受け付けたふりをする
  if (body && typeof body === "object" && (body as { website?: string }).website) {
    return NextResponse.json({ ok: true, code: "------", mailSent: true });
  }
  try {
    const r = await createReservation(body, new Date(), await clientIp());
    return NextResponse.json({ ok: true, code: r.code, mailSent: r.mailStatus === "sent" });
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    console.error(e);
    return NextResponse.json({ ok: false, error: "送信に失敗しました。時間をおいてもう一度お試しください" }, { status: 500 });
  }
}
