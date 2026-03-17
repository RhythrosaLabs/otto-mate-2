import type { Metadata } from "next";
import { listGallery } from "@/lib/db";
import { GalleryClient } from "./gallery-client";

export const metadata: Metadata = { title: "Gallery — Ottomate" };
export const dynamic = "force-dynamic";

export default function GalleryPage() {
  let items: ReturnType<typeof listGallery> = [];
  try {
    items = listGallery();
  } catch (err) {
    console.error("[gallery] Failed to load gallery:", err);
  }
  return <GalleryClient items={items} />;
}
