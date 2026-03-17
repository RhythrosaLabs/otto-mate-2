import type { Metadata } from "next";
import { AuditClient } from "./audit-client";

export const metadata: Metadata = { title: "Audit Trail — Ottomate" };

export default function AuditPage() {
  return <AuditClient />;
}
