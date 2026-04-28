import { redirect } from "next/navigation";

/**
 * /computer/image-studio redirects to the Creative Suite (Nova/Firefly).
 * The agent system prompt refers to this route — keeping it alive prevents 404s
 * when the AI navigates users here.
 */
export default function ImageStudioPage() {
  redirect("/computer/firefly");
}
