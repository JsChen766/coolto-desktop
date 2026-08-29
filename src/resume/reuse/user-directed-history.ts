import type { ResumeFull } from "../types.js";

export interface UserDirectedExperienceHistory {
  experienceId: string;
  resume: ResumeFull;
}

export function selectUserDirectedExperienceHistory(input: {
  experienceIds: readonly string[];
  resumes: readonly ResumeFull[];
  language: string;
}): UserDirectedExperienceHistory[] {
  const eligible = input.resumes.filter((resume) =>
    resume.qualityStatus === "passed" &&
    resume.status !== "archived" &&
    !resume.deletedAt &&
    resume.structured.language === input.language
  );
  return input.experienceIds.flatMap((experienceId) => {
    const uses = eligible.filter((resume) =>
      resumeExperienceIds(resume).has(experienceId)
    );
    const general = uses.filter((resume) => resume.jdId === null);
    const resume = newest(general.length ? general : uses);
    return resume ? [{ experienceId, resume }] : [];
  });
}

function newest(resumes: readonly ResumeFull[]): ResumeFull | undefined {
  return [...resumes].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt) ||
    right.id.localeCompare(left.id)
  )[0];
}

function resumeExperienceIds(resume: ResumeFull): Set<string> {
  return new Set(resume.structured.sections.flatMap((section) =>
    section.items.flatMap((item) => item.source_experience_id ?? [])
  ));
}
