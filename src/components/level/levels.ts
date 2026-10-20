export const LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type SkillLevel = (typeof LEVELS)[number];

export const LEVEL_INFO: Record<SkillLevel, { label: string; colour: string }> =
  {
    beginner: { label: "Beginner", colour: "#4bc292" },
    intermediate: { label: "Intermediate", colour: "#ff9a00" },
    advanced: { label: "Advanced", colour: "#fe5f55" },
  };

export function isSkillLevel(v: unknown): v is SkillLevel {
  return typeof v === "string" && (LEVELS as readonly string[]).includes(v);
}
