import type { Metadata } from "next";
import { FireflyHome } from "./firefly-home";

export const metadata: Metadata = { title: "Creative Suite — Ottomate" };

export default function FireflyPage() {
  return <FireflyHome />;
}
