import type { Metadata } from "next";
import { ImageStudioClient } from "./image-studio-client";

export const metadata: Metadata = { title: "Image Studio — Ottomate" };

export default function ImageStudioPage() {
  return (
    <div className="h-full">
      <ImageStudioClient />
    </div>
  );
}
