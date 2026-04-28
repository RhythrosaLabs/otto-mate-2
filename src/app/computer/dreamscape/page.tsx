import { redirect } from "next/navigation";

/**
 * /computer/dreamscape redirects to the Video Studio.
 * The studio sub-route is the canonical URL listed in NAV_ITEMS.
 */
export default function DreamscapePage() {
  redirect("/computer/dreamscape/studio");
}
