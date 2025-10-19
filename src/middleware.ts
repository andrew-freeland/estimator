import { NextResponse, type NextRequest } from "next/server";

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

  // Temporarily disable session check for testing
  // TODO: Re-enable after fixing session cookie issue
  console.log("Middleware: Checking session for", pathname);
  console.log(
    "Middleware: Available cookies:",
    request.cookies.getAll().map((c) => c.name),
  );

  // Check for any better-auth session cookies
  const sessionCookies = [
    "ba-session",
    "better-auth.session",
    "better-auth-session",
    "session",
  ];

  const hasSession = sessionCookies.some(
    (cookieName) => request.cookies.get(cookieName)?.value,
  );

  console.log("Middleware: Has session:", hasSession);

  // Temporarily allow access to estimator for testing
  if (pathname === "/estimator") {
    return NextResponse.next();
  }

  if (!hasSession) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|api/auth|export|sign-in|sign-up).*)",
  ],
};
