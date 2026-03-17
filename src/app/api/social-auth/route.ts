/**
 * Social Auth State API
 *
 * Manages persistent browser auth state for social media platforms.
 * Allows capturing, viewing, and clearing cached login sessions.
 *
 * GET  /api/social-auth — List auth state for all platforms
 * POST /api/social-auth — Capture auth state for a platform (requires active login)
 * DELETE /api/social-auth — Clear auth state for a platform
 *
 * Auth state is stored locally at ~/.ottomate/browser-profiles/{platform}/
 * and NEVER exposed in API responses — only metadata (cookie count, age, etc.)
 */

import { NextRequest, NextResponse } from "next/server";
import { captureAuthState, getAuthStateSummary } from "@/lib/social-media-browser";
import { safeErrorMessage } from "@/lib/constants";

export const dynamic = "force-dynamic";

// GET — List auth state summary for all platforms
export async function GET() {
  try {
    const summary = getAuthStateSummary();
    return NextResponse.json({
      platforms: summary,
      storage_location: "~/.ottomate/browser-profiles/",
      note: "Auth state is stored locally and never transmitted. Cookie values are not exposed in this API.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

// POST — Capture auth state for a platform (must already be logged in)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const platform = body.platform as string;

    if (!platform) {
      return NextResponse.json(
        { error: "Missing 'platform' field. Supported: twitter, linkedin, instagram, reddit, facebook, bluesky" },
        { status: 400 }
      );
    }

    const validPlatforms = ["twitter", "linkedin", "instagram", "reddit", "facebook", "bluesky"];
    if (!validPlatforms.includes(platform)) {
      return NextResponse.json(
        { error: `Invalid platform: ${platform}. Supported: ${validPlatforms.join(", ")}` },
        { status: 400 }
      );
    }

    const result = await captureAuthState(platform as Parameters<typeof captureAuthState>[0]);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err) },
      { status: 500 }
    );
  }
}

// DELETE — Clear auth state for a platform
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const platform = searchParams.get("platform");

    if (!platform) {
      return NextResponse.json(
        { error: "Missing 'platform' query parameter" },
        { status: 400 }
      );
    }

    const fs = await import("fs");
    const path = await import("path");
    const profileDir = path.join(
      process.env.HOME || process.env.USERPROFILE || "/tmp",
      ".ottomate",
      "browser-profiles",
      platform
    );

    let cleared = 0;
    for (const file of ["cookies.json", "storage-state.json", "local-storage.json"]) {
      const filePath = path.join(profileDir, file);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        cleared++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Cleared ${cleared} auth files for ${platform}`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err) },
      { status: 500 }
    );
  }
}
