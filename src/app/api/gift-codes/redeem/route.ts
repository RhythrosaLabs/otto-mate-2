import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { redeemGiftCode } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/constants";

// POST /api/gift-codes/redeem — redeem a gift code
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return apiError("Unauthorized", 401);

  const body = await req.json() as { code?: string };
  const code = body.code?.trim().toUpperCase();
  if (!code) return apiError("code is required", 400);

  const result = await redeemGiftCode(code, session.userId);
  if (!result.success) return apiError(result.error ?? "Redemption failed", 400);

  return apiSuccess({ tier: result.tier, message: `Successfully upgraded to ${result.tier} tier!` });
}
