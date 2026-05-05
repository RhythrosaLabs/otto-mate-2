import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "ottomate_session";

// These paths are publicly accessible — no auth required
const PUBLIC_PATHS = [
  "/auth/login",
  "/auth/register",
  "/pricing",
  "/api/auth/login",
  "/api/auth/register",
  "/api/health",
  "/api/hooks",
  "/api/auth/callback",
  "/api/channels/telegram",
  "/api/channels/slack",
  "/api/channels/discord",
  "/api/whatsapp",
  "/api/stripe/webhook",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function getJwtSecret(): Uint8Array {
  const secret = process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Dev bypass: skip auth when DISABLE_AUTH=true ──────────────────────
  if (process.env.DISABLE_AUTH === "true") {
    if (pathname === "/computer/app-builder") {
      const response = NextResponse.next();
      response.headers.set("Cross-Origin-Embedder-Policy", "credentialless");
      response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
      return response;
    }
    return NextResponse.next();
  }

  // ── COEP/COOP for App Builder ─────────────────────────────────────────
  if (pathname === "/computer/app-builder") {
    const response = NextResponse.next();
    response.headers.set("Cross-Origin-Embedder-Policy", "credentialless");
    response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
    return response;
  }

  // ── Static assets & public paths always pass ──────────────────────────
  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // ── Verify session cookie ─────────────────────────────────────────────
  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (token) {
    try {
      await jwtVerify(token, getJwtSecret());
      return NextResponse.next();
    } catch {
      // Token invalid or expired — fall through to redirect
    }
  }

  // ── Unauthenticated — redirect to login or 401 for API ────────────────
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const loginUrl = new URL("/auth/login", request.url);
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
