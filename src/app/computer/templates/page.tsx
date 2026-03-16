import { listTemplates } from "@/lib/db";
import { TemplatesClient } from "./templates-client";

export const dynamic = "force-dynamic";

export default function TemplatesPage() {
  const templates = listTemplates();
  return <TemplatesClient templates={templates} />;
}
