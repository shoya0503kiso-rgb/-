import { NextResponse } from "next/server";
import { dayAvailability, seasonAvailability } from "@/server/reservations";

export const dynamic = "force-dynamic";

// GET /api/availability            → 受付期間の各日の状態
// GET /api/availability?date=YYYY-MM-DD → その日のスタート時間ごとの空き
export async function GET(req: Request) {
  const date = new URL(req.url).searchParams.get("date");
  const body = date ? await dayAvailability(date) : await seasonAvailability();
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
