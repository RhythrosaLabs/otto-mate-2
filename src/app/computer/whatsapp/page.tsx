import type { Metadata } from "next";
import WhatsAppClient from "./whatsapp-client";

export const metadata: Metadata = {
  title: "WhatsApp — Ottomatron",
};

export default function WhatsAppPage() {
  return <WhatsAppClient />;
}
