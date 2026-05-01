import { redirect } from "next/navigation";
import Link from "next/link";
import { Lock, Sparkles } from "lucide-react";
import { getSession } from "@/lib/auth";
import { getUserSubscription, TIERS } from "@/lib/db";
import type { TierLimits } from "@/lib/db";

interface TierGateProps {
  feature: keyof Pick<TierLimits, "computer_use" | "creative_suite" | "video_suite" | "analytics" | "api_access">;
  featureLabel: string;
  requiredTierLabel?: string;
  children: React.ReactNode;
}

/**
 * Server component that checks tier access.
 * Renders children if allowed, otherwise shows an upgrade wall.
 */
export async function TierGate({ feature, featureLabel, requiredTierLabel = "Starter ($12/mo)", children }: TierGateProps) {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  const sub = await getUserSubscription(session.userId);
  const tier = TIERS[sub.tier];

  if (tier[feature]) {
    return <>{children}</>;
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-8">
      <div className="max-w-sm text-center space-y-5">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-violet-500 via-pink-500 to-orange-500 flex items-center justify-center">
          <Lock size={26} className="text-white" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-pplx-text mb-1">{featureLabel} requires an upgrade</h2>
          <p className="text-sm text-pplx-muted leading-relaxed">
            This feature is available on the <strong className="text-pplx-text">{requiredTierLabel}</strong> plan and above.
            You&apos;re currently on the <strong className="text-pplx-text capitalize">{sub.tier}</strong> plan.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Link
            href="/pricing"
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 via-pink-500 to-orange-500 text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Sparkles size={14} /> Upgrade now
          </Link>
          <Link
            href="/computer"
            className="text-xs text-pplx-muted hover:text-pplx-text transition-colors"
          >
            Go back
          </Link>
        </div>
      </div>
    </div>
  );
}
