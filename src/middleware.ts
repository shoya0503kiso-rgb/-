import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, verifyAdminSession } from "@/server/session-token";

const PASSWORD_PAGE = "/admin/settings/admins";

// 管理画面の入口チェック（各画面・アクションでも requireAdmin で再確認する）
export async function middleware(req: NextRequest) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const session = token ? await verifyAdminSession(token) : null;
  if (session) {
    // 初期・仮パスワードのままなら、パスワード変更画面以外には入れない（画面遷移・API・操作すべて）
    if (session.mustChange && req.nextUrl.pathname !== PASSWORD_PAGE) {
      if (req.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "password change required" }, { status: 403 });
      return NextResponse.redirect(new URL(`${PASSWORD_PAGE}?first=1`, req.url));
    }
    return NextResponse.next();
  }
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL("/login", req.url);
  url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/admin/:path*", "/api/admin/:path*"] };
