import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Not a hard crash — Supabase is optional sync layer
  console.warn("[supabase] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY not set. Supabase sync disabled.");
}

/**
 * Public (anon) client — safe to use in browser and server components
 * for read-only or row-level-security-protected operations.
 */
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

/**
 * Service-role client — server-only, bypasses RLS.
 * Only available when SUPABASE_SERVICE_ROLE_KEY is set.
 * Never expose this to the browser.
 */
export const supabaseAdmin = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

export const supabaseEnabled = !!supabase;

// ─── Sync helpers ──────────────────────────────────────────────────────────

/**
 * Upsert a user record into Supabase (called after local SQLite write).
 * Silently swallows errors so Supabase outages never break the app.
 */
export async function syncUserToSupabase(user: {
  id: string;
  email: string;
  name?: string | null;
  created_at: string;
}): Promise<void> {
  if (!supabaseAdmin) return;
  try {
    const { error } = await supabaseAdmin
      .from("users")
      .upsert({ id: user.id, email: user.email, name: user.name ?? null, created_at: user.created_at }, { onConflict: "id" });
    if (error) console.warn("[supabase] syncUserToSupabase error:", error.message);
  } catch (err) {
    console.warn("[supabase] syncUserToSupabase exception:", err);
  }
}

/**
 * Upsert a subscription record into Supabase.
 */
export async function syncSubscriptionToSupabase(sub: {
  id: string;
  user_id: string;
  tier: string;
  status: string;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  updated_at: string;
}): Promise<void> {
  if (!supabaseAdmin) return;
  try {
    const { error } = await supabaseAdmin
      .from("subscriptions")
      .upsert({ ...sub }, { onConflict: "user_id" });
    if (error) console.warn("[supabase] syncSubscriptionToSupabase error:", error.message);
  } catch (err) {
    console.warn("[supabase] syncSubscriptionToSupabase exception:", err);
  }
}
