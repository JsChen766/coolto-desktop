import type { CooltoApiClient } from "../../api/coolto-api-client.js";
import type { ExperienceDetail } from "../../api/experience-types.js";
import { ResumeSourceSnapshotBuilder } from "../source-snapshot.js";
import { STANDARD_RESUME_TEMPLATE_SNAPSHOT } from "../template-contract.js";
import type { ResumeSourceSnapshot } from "../source-types.js";
import {
  planResumeWriting,
  type PlanningParameters,
  type WritingPlan,
} from "./planner.js";

export interface AutoExpansionDependencies {
  listAdditionalExperiences: () => Promise<ExperienceDetail[]>;
  planWith: (experienceIds: readonly string[]) => Promise<{
    snapshot: ResumeSourceSnapshot;
    plan: WritingPlan;
  }>;
}

export interface ExpansionResult {
  expanded: boolean;
  experienceIds: string[];
  plan: WritingPlan;
  addedExperienceIds: string[];
  /** All active experiences were added and the gate is still unreachable. */
  exhausted: boolean;
  additionalCharsNeeded: number;
}

/**
 * Generation-start material check. When the plan reports the selected
 * experiences cannot physically reach the 85% page gate, automatically relax
 * the selection threshold: add the remaining active experiences in JD
 * relevance order until the gate is reachable. Only when every available
 * experience has been added does it fall back to asking the user for new
 * material.
 */
export async function autoExpandToGate(
  experienceIds: readonly string[],
  plan: WritingPlan,
  jdRequirements: ResumeSourceSnapshot["jd"]["requirements"],
  dependencies: AutoExpansionDependencies,
): Promise<ExpansionResult> {
  if (!plan.insufficient) {
    return {
      expanded: false,
      experienceIds: [...experienceIds],
      plan,
      addedExperienceIds: [],
      exhausted: false,
      additionalCharsNeeded: 0,
    };
  }
  const additional = await dependencies.listAdditionalExperiences();
  const ranked = rankByJdRelevance(jdRequirements, additional);
  const selected = [...experienceIds];
  const addedExperienceIds: string[] = [];
  let currentPlan = plan;
  for (const candidate of ranked) {
    if (selected.includes(candidate.id)) continue;
    selected.push(candidate.id);
    addedExperienceIds.push(candidate.id);
    const { snapshot, plan: candidatePlan } = await dependencies.planWith(selected);
    currentPlan = candidatePlan;
    if (!candidatePlan.insufficient) {
      return {
        expanded: true,
        experienceIds: selected,
        plan: candidatePlan,
        addedExperienceIds,
        exhausted: false,
        additionalCharsNeeded: 0,
      };
    }
    void snapshot;
  }
  return {
    expanded: addedExperienceIds.length > 0,
    experienceIds: selected,
    plan: currentPlan,
    addedExperienceIds,
    exhausted: true,
    additionalCharsNeeded: currentPlan.additionalCharsNeeded,
  };
}

export function rankByJdRelevance(
  jdRequirements: ResumeSourceSnapshot["jd"]["requirements"],
  experiences: readonly ExperienceDetail[],
): ExperienceDetail[] {
  const terms = new Set<string>();
  for (const requirement of jdRequirements) {
    const words =
      requirement.keywords.length > 0
        ? requirement.keywords
        : requirement.text
            .split(/[^\p{L}\p{N}+#.]+/u)
            .filter((term) => term.length >= 2);
    for (const word of words) terms.add(word.toLocaleLowerCase());
  }
  return [...experiences].sort((left, right) => {
    const leftScore = score(terms, left);
    const rightScore = score(terms, right);
    return rightScore - leftScore || left.id.localeCompare(right.id);
  });
}

function score(terms: ReadonlySet<string>, experience: ExperienceDetail): number {
  const text = `${experience.currentRevision?.content ?? ""} ${experience.tags.join(" ")}`.toLocaleLowerCase();
  let hits = 0;
  for (const term of terms) {
    if (term.length >= 2 && text.includes(term)) hits += 1;
  }
  return hits;
}

export async function listAllActiveExperiences(
  client: CooltoApiClient,
): Promise<ExperienceDetail[]> {
  const items: ExperienceDetail[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.searchExperiences({
      status: "active",
      limit: 100,
      ...(cursor ? { cursor } : {}),
    });
    for (const summary of page.items) {
      items.push(await client.getExperience(summary.id));
    }
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return items;
}

export function createRealAutoExpansion(
  client: CooltoApiClient,
  builder: ResumeSourceSnapshotBuilder,
  jdId: string,
  typography: PlanningParameters,
  language: "zh-CN" | "en-US",
  maxBulletLines = 2,
): AutoExpansionDependencies {
  return {
    listAdditionalExperiences: () => listAllActiveExperiences(client),
    planWith: async (experienceIds) => {
      const snapshot = await builder.build({
        jdId,
        experienceIds: [...experienceIds],
        template: STANDARD_RESUME_TEMPLATE_SNAPSHOT,
      });
      return {
        snapshot,
        plan: planResumeWriting(
          snapshot,
          experienceIds,
          typography,
          language,
          maxBulletLines,
        ),
      };
    },
  };
}
