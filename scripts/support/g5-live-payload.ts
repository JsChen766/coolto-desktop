import { createHash } from "node:crypto";

import type { ExperienceCreateInput, ExperienceDetail } from "../../src/api/types.js";
import type { ResumeCompileResult } from "../../src/resume/compiler-types.js";
import { toBrowserLayoutObservation } from "../../src/resume/save/layout-observation.js";
import type { ResumeSaveApprovalPayload, ResumeSaveMode } from "../../src/resume/save/types.js";
import type { BulletEvidenceBinding } from "../../src/resume/source-types.js";
import type { ResumeSectionType, ResumeStructure } from "../../src/resume/types.js";

export interface LiveExperienceDefinition {
  itemId: string;
  input: ExperienceCreateInput;
}

export interface CreatedLiveExperience {
  itemId: string;
  content: string;
  experience: ExperienceDetail;
}

export function liveExperienceDefinitions(
  structure: ResumeStructure,
  runLabel: string,
): LiveExperienceDefinition[] {
  return structure.sections.flatMap((section) =>
    section.items.flatMap((item) => {
      const category = experienceCategory(section.type);
      if (!category) return [];
      const content = item.bullets.length
        ? item.bullets.map((bullet) => bullet.text).join("\n")
        : [item.title, item.organization, item.role].filter(Boolean).join("；");
      return [{
        itemId: item.id,
        input: {
          category,
          title: `G5 LIVE QA ${runLabel} / ${item.title ?? item.id}`,
          content,
          ...(item.organization ? { organization: item.organization } : {}),
          ...(item.role ? { role: item.role } : {}),
          tags: ["g5-live-qa"],
        },
      }];
    }),
  );
}

export function createLiveSavePayload(input: {
  source: ResumeStructure;
  compileResult: ResumeCompileResult;
  created: CreatedLiveExperience[];
  jdId: string;
  targetRole: string | null;
  proposalId: string;
  title: string;
  mode: ResumeSaveMode;
  resumeId?: string;
  expectedContentHash?: string;
}): ResumeSaveApprovalPayload {
  const structured = structuredClone(input.source);
  const byItem = new Map(input.created.map((source) => [source.itemId, source]));
  const evidenceBindings: BulletEvidenceBinding[] = [];
  for (const section of structured.sections) {
    for (const item of section.items) {
      const created = byItem.get(item.id);
      if (!created) {
        item.source_experience_id = null;
        continue;
      }
      const revision = currentRevision(created.experience);
      item.source_experience_id = created.experience.id;
      for (const bullet of item.bullets) {
        delete bullet.source_fact_ids;
        const sourceStart = created.content.indexOf(bullet.text);
        if (sourceStart < 0) throw new Error(`Missing source text for ${bullet.id}`);
        evidenceBindings.push({
          bulletId: bullet.id,
          sourceExperienceId: created.experience.id,
          bulletText: bullet.text,
          excerpts: [{
            experienceId: created.experience.id,
            revisionId: revision.id,
            revisionContentHash: sha256(created.content),
            sourceStart,
            sourceEnd: sourceStart + bullet.text.length,
            sourceQuote: bullet.text,
          }],
          matchedRequirementIds: [],
        });
      }
    }
  }
  structured.quality_status = "passed";
  structured.quality_issues = [];
  structured.layout_usage_ratio = input.compileResult.usageRatio;
  return {
    proposalId: input.proposalId,
    mode: input.mode,
    candidateId: `candidate-${input.proposalId}`,
    candidateRevision: 0,
    title: input.title,
    targetRole: input.targetRole,
    jdId: input.jdId,
    ...(input.resumeId ? { resumeId: input.resumeId } : {}),
    ...(input.expectedContentHash
      ? { expectedContentHash: input.expectedContentHash }
      : {}),
    sourceFingerprint: sha256(input.created.map((source) => source.experience.id).join(":")),
    structured,
    evidenceBindings,
    observation: toBrowserLayoutObservation(input.compileResult, input.proposalId),
  };
}

function currentRevision(experience: ExperienceDetail) {
  const revision = experience.revisions.find(
    (candidate) => candidate.id === experience.currentRevisionId,
  );
  if (!revision) throw new Error(`No current revision for ${experience.id}`);
  return revision;
}

function experienceCategory(type: ResumeSectionType) {
  if (type === "education") return "education" as const;
  if (type === "experience") return "work" as const;
  if (type === "project") return "project" as const;
  return null;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
