import type { Metadata } from "next";
import { GalleryClient } from "./gallery-client";

export const metadata: Metadata = { title: "Gallery — Nova" };

export default function GalleryPage() {
  return <GalleryClient />;
}
