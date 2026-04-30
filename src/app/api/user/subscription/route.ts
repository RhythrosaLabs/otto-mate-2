import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { getUserSubscription, TIERS } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const sub = getUserSubscription(session.userId);
  const limits = TIERS[sub.tier];

  return NextResponse.json({
    subscription: sub,
    limits,
  });
}
