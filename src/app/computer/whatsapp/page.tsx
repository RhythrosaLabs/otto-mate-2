import type { Metadata } from "next";
import WhatsAppClient from "./whatsapp-client";

export const metadata: Metadata = {
  title: "WhatsApp — Ottomate",
};

export default function WhatsAppPage() {
  return <WhatsAppClient />;
}
