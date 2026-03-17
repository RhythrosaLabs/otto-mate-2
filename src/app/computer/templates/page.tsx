import type { Metadata } from "next";
import { listTemplates } from "@/lib/db";
import { TemplatesClient } from "./templates-client";

export const metadata: Metadata = { title: "Templates — Ottomate" };
export const dynamic = "force-dynamic";

export default function TemplatesPage() {
  let templates: ReturnType<typeof listTemplates> = [];
  try {
    templates = listTemplates();
  } catch (err) {
    console.error("[templates] Failed to load templates:", err);
  }
  return <TemplatesClient templates={templates} />;
}
