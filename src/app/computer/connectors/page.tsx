import { listConnectorConfigs } from "@/lib/db";
import { ALL_CONNECTORS } from "@/lib/connectors-data";
import { ConnectorsClient } from "./connectors-client";

export const dynamic = "force-dynamic";

export default function ConnectorsPage() {
  const configs = listConnectorConfigs();
  const connectedIds = configs.map((c) => c.connector_id);
  return <ConnectorsClient connectors={ALL_CONNECTORS} connectedIds={connectedIds} />;
}
