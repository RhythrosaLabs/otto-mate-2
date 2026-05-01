import type { Metadata } from "next";
import { listConnectorConfigs } from "@/lib/db";
import { ALL_CONNECTORS } from "@/lib/connectors-data";
import { ConnectorsClient } from "./connectors-client";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Connectors — Ottomate" };
export const dynamic = "force-dynamic";

export default async function ConnectorsPage() {
  const session = await getSession();
  let connectedIds: string[] = [];
  try {
    const configs = await listConnectorConfigs(session?.userId);
    connectedIds = configs.map((c) => c.connector_id);
  } catch (err) {
    console.error("[connectors] Failed to load connector configs:", err);
  }
  return <ConnectorsClient connectors={ALL_CONNECTORS} connectedIds={connectedIds} />;
}
