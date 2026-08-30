import type {
  ResumeSourceSnapshot,
  ResumeSourceJdSnapshot,
  ResumeSourceRequirementSnapshot,
} from "./source-types.js";

export type ResumeGenerationStrategy = "tailored" | "general";

export function resumeGenerationStrategy(
  snapshot: ResumeSourceSnapshot,
): ResumeGenerationStrategy {
  return snapshot.generationStrategy === "general" ? "general" : "tailored";
}

export function resumeSourceJd(
  snapshot: ResumeSourceSnapshot,
): Readonly<ResumeSourceJdSnapshot> | null {
  return snapshot.jd;
}

export function requireResumeSourceJd(
  snapshot: ResumeSourceSnapshot,
): Readonly<ResumeSourceJdSnapshot> {
  if (!snapshot.jd) throw new Error("针对性简历来源缺少 JD");
  return snapshot.jd;
}

export function sameResumeGenerationTarget(
  left: ResumeSourceSnapshot,
  right: ResumeSourceSnapshot,
): boolean {
  return resumeGenerationStrategy(left) === resumeGenerationStrategy(right) &&
    (left.jd?.id ?? null) === (right.jd?.id ?? null);
}

export function resumeSourceRequirements(
  snapshot: ResumeSourceSnapshot,
): readonly Readonly<ResumeSourceRequirementSnapshot>[] {
  return snapshot.jd?.requirements ?? [];
}
