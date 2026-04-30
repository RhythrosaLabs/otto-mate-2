/**
 * Tier definitions — browser-safe (no Node.js dependencies).
 * Import from here in client components; @/lib/db re-exports these
 * for server-side code that also needs DB functions.
 */

export type TierName = "free" | "starter" | "pro" | "agency";

export interface TierLimits {
  name: TierName;
  label: string;
  price_monthly: number; // USD
  tasks_per_month: number; // -1 = unlimited
  computer_use: boolean;
  creative_suite: boolean;
  video_suite: boolean;
  scheduled_tasks: number; // max count, -1 = unlimited
  skills: number; // max count, -1 = unlimited
  connectors: number; // max count, -1 = unlimited
  memory_entries: number; // max, -1 = unlimited
  file_storage_mb: number; // -1 = unlimited
  models: "basic" | "standard" | "premium" | "all";
  analytics: boolean;
  api_access: boolean;
  priority_support: boolean;
  description: string;
  features: string[];
}

export const TIERS: Record<TierName, TierLimits> = {
  free: {
    name: "free",
    label: "Free",
    price_monthly: 0,
    tasks_per_month: 50,
    computer_use: false,
    creative_suite: false,
    video_suite: false,
    scheduled_tasks: 0,
    skills: 5,
    connectors: 2,
    memory_entries: 100,
    file_storage_mb: 100,
    models: "basic",
    analytics: false,
    api_access: false,
    priority_support: false,
    description: "Explore what AI agents can do",
    features: [
      "50 tasks / month",
      "5 reusable skills",
      "AI models (GPT-4o mini, Gemini Flash 2.0)",
      "File manager with 100 MB storage",
      "2 service integrations",
      "Persistent memory & context recall",
      "Full task history & audit log",
      "Community support",
    ],
  },
  starter: {
    name: "starter",
    label: "Starter",
    price_monthly: 12,
    tasks_per_month: 500,
    computer_use: false,
    creative_suite: true,
    video_suite: true,
    scheduled_tasks: 5,
    skills: 25,
    connectors: 10,
    memory_entries: 1000,
    file_storage_mb: 1024,
    models: "standard",
    analytics: false,
    api_access: false,
    priority_support: false,
    description: "Automate the work you do every day",
    features: [
      "500 tasks / month",
      "25 reusable skills",
      "AI models (GPT-4o, Claude Sonnet, Gemini Pro)",
      "5 scheduled automations (cron, recurring)",
      "Image & video generation",
      "10 service integrations",
      "1 GB file storage",
      "Email support",
    ],
  },
  pro: {
    name: "pro",
    label: "Pro",
    price_monthly: 39,
    tasks_per_month: -1,
    computer_use: true,
    creative_suite: true,
    video_suite: true,
    scheduled_tasks: -1,
    skills: -1,
    connectors: -1,
    memory_entries: -1,
    file_storage_mb: 10240,
    models: "premium",
    analytics: true,
    api_access: false,
    priority_support: true,
    description: "Your personal AI power user, no limits",
    features: [
      "Unlimited tasks & scheduled automations",
      "Unlimited skills & integrations",
      "Full AI model access (Claude Opus 4, GPT-4.1, Gemini Ultra)",
      "Browser & desktop computer control",
      "Multi-channel dispatch (Telegram, Discord, Slack, email)",
      "Full creative suite — Video, Audio & 3D Studio",
      "App builder & in-browser coding companion",
      "Advanced analytics & usage insights",
      "10 GB file storage",
      "Priority support",
    ],
  },
  agency: {
    name: "agency",
    label: "Agency",
    price_monthly: 99,
    tasks_per_month: -1,
    computer_use: true,
    creative_suite: true,
    video_suite: true,
    scheduled_tasks: -1,
    skills: -1,
    connectors: -1,
    memory_entries: -1,
    file_storage_mb: -1,
    models: "all",
    analytics: true,
    api_access: true,
    priority_support: true,
    description: "Built for high-volume and client work",
    features: [
      "Everything in Pro",
      "REST API access & webhook triggers",
      "Unlimited file storage",
      "All models including experimental & fine-tuned",
      "Team usage dashboard & per-user limits",
      "Custom skill & connector development",
      "Dedicated account manager & onboarding",
      "Uptime SLA guarantee",
    ],
  },
};
