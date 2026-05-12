import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { createGiftCode, listGiftCodes, isUserAdmin } from "@/lib/db";
import type { TierName } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/constants";

// GET /api/admin/gift-codes — list all codes (admin only)
export async function GET() {
  const session = await getSession();
  if (!session) return apiError("Unauthorized", 401);
  if (!await isUserAdmin(session.userId)) return apiError("Forbidden", 403);

  const codes = await listGiftCodes();
  return apiSuccess({ codes });
}

// POST /api/admin/gift-codes — generate a new gift code (admin only)
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return apiError("Unauthorized", 401);
  if (!await isUserAdmin(session.userId)) return apiError("Forbidden", 403);

  const body = await req.json() as { tier?: TierName; duration_days?: number; expires_at?: string };
  const { tier = "pro", duration_days = 30, expires_at } = body;

  const validTiers: TierName[] = ["free", "starter", "pro", "agency"];
  if (!validTiers.includes(tier)) return apiError("Invalid tier", 400);
  if (!Number.isInteger(duration_days) || duration_days < 1) return apiError("duration_days must be a positive integer", 400);

  const code = await createGiftCode({ tier, duration_days, created_by: session.userId, expires_at: expires_at ?? null });
  return apiSuccess({ code }, 201);
}
