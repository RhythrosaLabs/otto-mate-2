"use client";

/**
 * Placeholder for the Audio Studio page.
 * The actual openDAW iframe is managed by OpenDAWPersistentIframe in the layout,
 * which preserves WebAudio state across route changes using off-screen
 * positioning instead of display:none.
 */
export function AudioStudioEmbed() {
  return <div className="h-full bg-[#0d0d0d]" />;
}
