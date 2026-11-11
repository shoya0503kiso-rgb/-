import { NextResponse, type NextRequest } from "next/server";
import { hasCronSecret } from "@/server/bearer";
import { runDaily } from "@/server/cron";

// Vercel Cron 等から毎日 10:00 JST（01:00 UTC）に呼ぶ。Authorization: Bearer CRON_SECRET
export async function GET(req: NextRequest) {
  if (!hasCronSecret(req.headers.get("authorization"))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await runDaily());
}

export const POST = GET;
