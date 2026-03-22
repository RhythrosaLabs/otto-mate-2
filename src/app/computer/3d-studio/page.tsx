import type { Metadata } from "next";
import { ThreeDStudioEmbed } from "./three-d-studio-client";

export const metadata: Metadata = { title: "3D Studio — Ottomate" };

/**
 * 3D Studio page — the actual Blender iframe is managed by
 * BlenderPersistentIframe in the Computer layout for state persistence.
 */
export default function ThreeDStudioPage() {
  return <ThreeDStudioEmbed />;
}
