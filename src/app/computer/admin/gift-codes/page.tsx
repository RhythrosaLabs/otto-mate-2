import type { Metadata } from "next";
import { AdminGiftCodesClient } from "./gift-codes-client";

export const metadata: Metadata = { title: "Gift Codes — Admin — Ottomate" };

export default function AdminGiftCodesPage() {
  return <AdminGiftCodesClient />;
}
