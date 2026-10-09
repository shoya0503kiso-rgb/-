import { NextResponse, type NextRequest } from "next/server";
import { getAdmin } from "@/server/auth";
import { buildCsv, buildXlsx } from "@/server/export";
import { getEmployee } from "@/server/employees";
import { isValidYearMonth } from "@/lib/time";

export async function GET(req: NextRequest) {
  if (!(await getAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const ym = req.nextUrl.searchParams.get("ym") ?? "";
  const employeeId = req.nextUrl.searchParams.get("employeeId") || undefined;
  const format = req.nextUrl.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  if (!isValidYearMonth(ym)) return NextResponse.json({ error: "ym が不正です" }, { status: 400 });
  const employee = employeeId ? await getEmployee(employeeId) : null;
  if (employeeId && !employee) return NextResponse.json({ error: "従業員が見つかりません" }, { status: 404 });

  const base = `勤怠_${ym}${employee ? `_${employee.name}` : ""}`;
  const headers = (type: string, ext: string) => ({
    "Content-Type": type,
    "Content-Disposition": `attachment; filename="attendance_${ym}.${ext}"; filename*=UTF-8''${encodeURIComponent(base)}.${ext}`,
    "Cache-Control": "no-store",
  });
  if (format === "xlsx") {
    const buf = await buildXlsx(ym, employeeId);
    return new NextResponse(new Uint8Array(buf), {
      headers: headers("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"),
    });
  }
  return new NextResponse(await buildCsv(ym, employeeId), { headers: headers("text/csv; charset=utf-8", "csv") });
}
