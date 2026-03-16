import { listSkills } from "@/lib/db";
import { SkillsClient } from "./skills-client";

export const dynamic = "force-dynamic";

export default function SkillsPage() {
  const skills = listSkills();
  return <SkillsClient skills={skills} />;
}
