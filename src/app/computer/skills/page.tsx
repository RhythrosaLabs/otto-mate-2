import type { Metadata } from "next";
import { listSkills } from "@/lib/db";
import { SkillsClient } from "./skills-client";

export const metadata: Metadata = { title: "Skills — Ottomate" };
export const dynamic = "force-dynamic";

export default function SkillsPage() {
  let skills: ReturnType<typeof listSkills> = [];
  try {
    skills = listSkills();
  } catch (err) {
    console.error("[skills] Failed to load skills:", err);
  }
  return <SkillsClient skills={skills} />;
}
