import type { Metadata } from "next";
import { listSkills } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { SkillsClient } from "./skills-client";

export const metadata: Metadata = { title: "Skills — Ottomate" };
export const dynamic = "force-dynamic";

export default async function SkillsPage() {
  const session = await getSession();
  let skills: Awaited<ReturnType<typeof listSkills>> = [];
  try {
    skills = await listSkills(session?.userId);
  } catch (err) {
    console.error("[skills] Failed to load skills:", err);
  }
  return <SkillsClient skills={skills} />;
}
