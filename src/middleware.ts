import { NextRequest, NextResponse } from "next/server";

/**
 * Optional auth middleware for Ottomate.
 *
 * When `OTTOMATE_AUTH_TOKEN` is set in .env.local, every /api/* request
 * (except public health-check and webhook endpoints) must include the token
 * as a Bearer header or `x-ottomate-token` header.
 *
 * If `OTTOMATE_AUTH_TOKEN` is not set, all requests pass through (local dev default).
 */

// Routes that should never require auth
const PUBLIC_PATHS = [
  "/api/health",
  "/api/hooks",              // has its own webhook-secret auth
  "/api/auth/callback",      // OAuth callbacks from external providers
  "/api/channels/telegram",  // incoming webhook from Telegram
  "/api/channels/slack",     // incoming webhook from Slack
  "/api/channels/discord",   // incoming webhook from Discord
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only protect API routes
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Allow public paths
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = process.env.OTTOMATE_AUTH_TOKEN;

  // If no token configured, allow all (local dev mode)
  if (!token) {
    return NextResponse.next();
  }

  // Check for token in Authorization header or custom header
  const authHeader = request.headers.get("authorization");
  const customHeader = request.headers.get("x-ottomate-token");

  const providedToken =
    authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : customHeader;

  if (providedToken !== token) {
    return NextResponse.json(
      { error: "Unauthorized. Provide a valid token via Authorization: Bearer <token> or x-ottomate-token header." },
      { status: 401 },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
