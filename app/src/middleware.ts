// ET lives at "/", RU at "/ru"; internally both render app/[locale]/…
import { NextResponse, type NextRequest } from "next/server";

const PASS = /^\/(ru(\/|$)|admin|api|media|guide|p\/|_next|feedback\.js|robots\.txt|favicon|seed\/|og\.)/;

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/et/") || pathname === "/et") {
    const url = req.nextUrl.clone();
    url.pathname = pathname.slice(3) || "/";
    return NextResponse.redirect(url, 308);
  }
  if (PASS.test(pathname)) return NextResponse.next(); // /ru/* renders app/[locale]=ru directly; admin/api/static untouched
  const url = req.nextUrl.clone();
  url.pathname = "/et" + (pathname === "/" ? "" : pathname);
  return NextResponse.rewrite(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
