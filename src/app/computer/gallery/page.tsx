import { listGallery } from "@/lib/db";
import { GalleryClient } from "./gallery-client";

export const dynamic = "force-dynamic";

export default function GalleryPage() {
  const items = listGallery();
  return <GalleryClient items={items} />;
}
