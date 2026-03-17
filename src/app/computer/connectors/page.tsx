import type { Metadata } from "next";
import { listConnectorConfigs } from "@/lib/db";
import { ALL_CONNECTORS } from "@/lib/connectors-data";
import { ConnectorsClient } from "./connectors-client";

export const metadata: Metadata = { title: "Connectors — Ottomate" };
export const dynamic = "force-dynamic";

export default function ConnectorsPage() {
  let connectedIds: string[] = [];
  try {
    const configs = listConnectorConfigs();
    connectedIds = configs.map((c) => c.connector_id);
  } catch (err) {
    console.error("[connectors] Failed to load connector configs:", err);
  }
  return <ConnectorsClient connectors={ALL_CONNECTORS} connectedIds={connectedIds} />;
}
