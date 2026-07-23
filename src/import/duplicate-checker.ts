import type {
  ExperienceReader,
  ExperienceSummary,
} from "../api/types.js";
import type {
  CandidateDuplicateMatch,
  ExperienceImportCandidate,
} from "./types.js";

export async function findCandidateDuplicates(
  reader: ExperienceReader,
  candidates: ExperienceImportCandidate[],
  signal?: AbortSignal,
): Promise<CandidateDuplicateMatch[]> {
  const existing = await loadAllExperienceSummaries(reader, signal);
  const byFingerprint = new Map(
    existing.map((experience) => [
      experienceFingerprint(experience),
      experience,
    ]),
  );

  return candidates.flatMap((candidate, candidateIndex) => {
    const match = byFingerprint.get(experienceFingerprint(candidate));
    return match
      ? [
          {
            candidateIndex,
            existing: { id: match.id, title: match.title },
          },
        ]
      : [];
  });
}

async function loadAllExperienceSummaries(
  reader: ExperienceReader,
  signal?: AbortSignal,
): Promise<ExperienceSummary[]> {
  const items: ExperienceSummary[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < 20; page += 1) {
    const result = await reader.searchExperiences(
      {
        limit: 100,
        ...(cursor ? { cursor } : {}),
      },
      signal,
    );
    items.push(...result.items);
    if (!result.nextCursor) {
      return items;
    }
    cursor = result.nextCursor;
  }

  throw new Error("经历数量超过本地导入查重上限");
}

function experienceFingerprint(
  experience: Pick<
    ExperienceSummary | ExperienceImportCandidate,
    | "category"
    | "title"
    | "organization"
    | "role"
    | "startDate"
    | "endDate"
  >,
): string {
  return [
    experience.category,
    experience.title,
    experience.organization,
    experience.role,
    experience.startDate,
    experience.endDate,
  ]
    .map((value) => value?.trim().toLocaleLowerCase() ?? "")
    .join("|");
}
