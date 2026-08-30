import { projectEducationRawText } from "./education-details.js";
import type { ResumeSourceSnapshot } from "./source-types.js";
import type { ResumeStructure } from "./types.js";

export interface EducationCourseworkInput {
  experienceId: string;
  sourceQuote: string;
  courses: readonly string[];
}

/** Applies only Agent-identified coursework that is grounded verbatim in education. */
export function applyEducationCoursework(
  structure: ResumeStructure,
  snapshot: ResumeSourceSnapshot,
  inputs: readonly EducationCourseworkInput[] | undefined,
  language: string,
): string | undefined {
  const education = new Map(snapshot.experiences.filter((experience) =>
    experience.category === "education"
  ).map((experience) => [experience.id, experience] as const));
  const supplied = inputs ?? [];
  const ids = supplied.map((input) => input.experienceId.trim());
  if (new Set(ids).size !== ids.length) {
    return "educationCoursework 含重复 education experienceId";
  }
  const validated = new Map<string, string[]>();
  for (const input of supplied) {
    const source = education.get(input.experienceId.trim());
    if (!source) {
      return `educationCoursework ${input.experienceId} 不是当前 active 教育经历`;
    }
    const quote = normalize(input.sourceQuote).trim();
    if (!quote || !normalize(source.content).includes(quote)) {
      return `educationCoursework ${input.experienceId} 的 sourceQuote 不在原始教育经历中`;
    }
    const courses = [...new Set(input.courses.map((course) => course.trim()))];
    if (courses.length !== input.courses.length || courses.some((course) =>
      !course || !/[\p{L}\p{N}]/u.test(course) || !quote.includes(normalize(course))
    )) {
      return `educationCoursework ${input.experienceId} 的 courses 必须逐项出现在 sourceQuote 中且不得重复`;
    }
    validated.set(source.id, courses);
  }
  const section = structure.sections.find((candidate) =>
    candidate.type === "education"
  );
  for (const item of section?.items ?? []) {
    const source = item.source_experience_id
      ? education.get(item.source_experience_id)
      : undefined;
    if (!source) continue;
    item.raw_text = projectEducationRawText(
      source.content,
      language,
      validated.get(source.id) ?? [],
    );
  }
  return undefined;
}

function normalize(value: string): string {
  return value.normalize("NFKC");
}
