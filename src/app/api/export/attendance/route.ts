import { NextResponse, type NextRequest } from "next/server";
import { hasCronSecret } from "@/server/bearer";
import { exportAttendance } from "@/server/attendance-export";
import { UserError } from "@/server/errors";

// 外部連携用：GET /api/export/attendance?from=YYYY-MM-DD&to=YYYY-MM-DD（営業日）。Authorization: Bearer CRON_SECRET
export async function GET(req: NextRequest) {
  if (!hasCronSecret(req.headers.get("authorization"))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const from = req.nextUrl.searchParams.get("from") ?? "";
  const to = req.nextUrl.searchParams.get("to") ?? from;
  try {
    return NextResponse.json(await exportAttendance(from, to), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
