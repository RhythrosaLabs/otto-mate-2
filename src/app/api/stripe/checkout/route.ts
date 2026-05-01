import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getSessionFromRequest } from "@/lib/auth";
import { getUserSubscription } from "@/lib/db";
import type { TierName } from "@/lib/db";

export const dynamic = "force-dynamic";

// Map tier names to Stripe Price IDs (set these as env vars: STRIPE_PRICE_STARTER, etc.)
const TIER_PRICE_MAP: Record<string, string | undefined> = {
  starter: process.env.STRIPE_PRICE_STARTER,
  pro: process.env.STRIPE_PRICE_PRO,
  agency: process.env.STRIPE_PRICE_AGENCY,
};

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key, { apiVersion: "2026-04-22.dahlia" });
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session?.userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const tier = body.tier as TierName;
    if (!tier || tier === "free") {
      return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
    }

    const priceId = TIER_PRICE_MAP[tier];
    if (!priceId) {
      return NextResponse.json(
        { error: `Stripe price not configured for tier: ${tier}. Set STRIPE_PRICE_${tier.toUpperCase()} env var.` },
        { status: 500 }
      );
    }

    const stripe = getStripe();
    const sub = await getUserSubscription(session.userId);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://ottomate.fly.dev";

    // Reuse existing Stripe customer if available
    let customerId = sub.stripe_customer_id;
    if (!customerId && session.email) {
      const customer = await stripe.customers.create({
        email: session.email,
        metadata: { userId: session.userId },
      });
      customerId = customer.id;
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/computer?upgrade=success&tier=${tier}`,
      cancel_url: `${appUrl}/pricing?upgrade=cancelled`,
      metadata: { userId: session.userId, tier },
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { userId: session.userId, tier },
      },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err) {
    console.error("[stripe/checkout]", err);
    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
  }
}
