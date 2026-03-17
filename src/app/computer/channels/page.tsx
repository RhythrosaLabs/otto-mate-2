import type { Metadata } from "next";
import { ChannelsClient } from "./channels-client";

export const metadata: Metadata = { title: "Channels — Ottomate" };

export default function ChannelsPage() {
  return <ChannelsClient />;
}
