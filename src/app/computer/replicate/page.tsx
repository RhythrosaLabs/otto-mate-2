import { redirect } from "next/navigation";

/**
 * /computer/replicate redirects to the Multimedia Playground.
 * The Playground supersedes this page with multi-provider support (Replicate + HuggingFace),
 * multi-column comparison, history, and file upload.
 */
export default function ReplicatePage() {
  redirect("/computer/playground");
}
