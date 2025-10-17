import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  /*
   * Playwright starts the dev server and requires a 200 status to
   * begin the tests, so this ensures that the tests can start
   */
  if (pathname.startsWith("/ping")) {
    return new Response("pong", { status: 200 });
  }

  if (pathname === "/admin") {
    return NextResponse.redirect(new URL("/admin/users", request.url));
  }

  // Research-backed fix: Better-auth Edge runtime compatibility
  // Use getSessionCookie for session detection, with fallback for Edge runtime
  let sessionCookie;
  try {
    sessionCookie = getSessionCookie(request);
  } catch (_error) {
    // Fallback: check for session cookie presence manually if getSessionCookie fails on Edge
    sessionCookie = request.cookies.get("ba-session")?.value;
  }

  if (!sessionCookie) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|api/auth|export|sign-in|sign-up).*)",
  ],
};
