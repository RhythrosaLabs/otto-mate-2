import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { updateUserTier, getUserByStripeCustomerId } from "@/lib/db";
import type { TierName } from "@/lib/db";

export const dynamic = "force-dynamic";

// Stripe sends raw body — disable body parsing for signature verification
export const config = { api: { bodyParser: false } };

const PRICE_TO_TIER: Record<string, TierName> = {
  [process.env.STRIPE_PRICE_STARTER ?? "price_starter"]: "starter",
  [process.env.STRIPE_PRICE_PRO ?? "price_pro"]: "pro",
  [process.env.STRIPE_PRICE_AGENCY ?? "price_agency"]: "agency",
};

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key, { apiVersion: "2026-04-22.dahlia" });
}

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[stripe/webhook] STRIPE_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const rawBody = await req.arrayBuffer();
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(Buffer.from(rawBody), sig, webhookSecret);
  } catch (err) {
    console.error("[stripe/webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        const tier = session.metadata?.tier as TierName | undefined;
        const stripeCustomerId = session.customer as string | undefined;
        const stripeSubscriptionId = session.subscription as string | undefined;

        if (userId && tier) {
          await updateUserTier(userId, tier, stripeCustomerId, stripeSubscriptionId);
          console.log(`[stripe/webhook] Upgraded user ${userId} to ${tier}`);
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const priceId = subscription.items.data[0]?.price?.id;
        const tier = priceId ? PRICE_TO_TIER[priceId] : undefined;
        const status = subscription.status;

        if (tier) {
          const user = await getUserByStripeCustomerId(customerId);
          if (user) {
            if (status === "active" || status === "trialing") {
              await updateUserTier(user.id, tier, customerId, subscription.id);
              console.log(`[stripe/webhook] Updated user ${user.id} subscription to ${tier}`);
            }
          }
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const user = await getUserByStripeCustomerId(customerId);
        if (user) {
          await updateUserTier(user.id, "free", customerId, undefined);
          console.log(`[stripe/webhook] Downgraded user ${user.id} to free (subscription cancelled)`);
        }
        break;
      }

      case "invoice.payment_failed": {
        // Log only — don't immediately downgrade; Stripe retries before marking past_due
        const invoice = event.data.object as Stripe.Invoice;
        console.warn(`[stripe/webhook] Payment failed for customer ${invoice.customer}`);
        break;
      }

      default:
        // Unhandled event type — safe to ignore
        break;
    }
  } catch (err) {
    console.error("[stripe/webhook] Handler error:", err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
