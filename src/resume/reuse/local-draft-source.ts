import { createHash } from "node:crypto";

import type { LocalResumeDraft } from "../draft/types.js";
import { resumeGenerationReadiness } from "../workspace/generation-readiness.js";
import type { ResumeFull } from "../types.js";

export interface ResumeReuseDraftSource {
  listReusableDrafts(): Promise<LocalResumeDraft[]>;
  getReusableDraft(artifactId: string): Promise<LocalResumeDraft>;
}

export function isReusableLocalDraft(draft: LocalResumeDraft): boolean {
  return draft.pendingChange === null &&
    draft.workspace.status === "ready_for_approval" &&
    resumeGenerationReadiness(draft.workspace).ready;
}

export function localDraftAsResume(draft: LocalResumeDraft): ResumeFull {
  if (!isReusableLocalDraft(draft)) {
    throw new Error("本地 ResumeDraft 尚未通过全部生成门槛或存在待确认修改");
  }
  const workspace = draft.workspace;
  const structured = structureWithEvidence(draft);
  return {
    id: draft.artifactId,
    title: draft.title,
    targetRole: workspace.sourceSnapshot.jd.targetRole,
    targetCompany: workspace.sourceSnapshot.jd.company,
    jdId: workspace.sourceSnapshot.jd.id,
    contentHash: localDraftContentHash(draft),
    schemaVersion: draft.schemaVersion,
    qualityStatus: "passed",
    status: "draft",
    entityVersion: workspace.revision,
    deletedAt: null,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
    structured,
    content: "",
    score: { overall: 0, relevance: 0, clarity: 0,
      evidenceStrength: 0, quantifiedImpact: 0 },
    evidenceSummary: [], riskSummary: [], missingInfo: [], qualityIssues: [],
    qualityGateVersion: "local-ready-resume-draft-v1",
  };
}

function structureWithEvidence(draft: LocalResumeDraft) {
  const structure = structuredClone(draft.workspace.structure);
  const bindings = new Map(draft.workspace.bindings.map((binding) => [
    binding.bulletId,
    binding,
  ]));
  for (const section of structure.sections) {
    for (const item of section.items) {
      for (const bullet of item.bullets) {
        const binding = bindings.get(bullet.id);
        if (!binding) continue;
        bullet.source_fact_ids = binding.excerpts.map((excerpt) =>
          `${excerpt.experienceId}:${excerpt.sourceStart}:${excerpt.sourceEnd}`
        );
        bullet.source_evidence = binding.excerpts.map((excerpt) => ({
          experience_id: excerpt.experienceId,
          revision_id: excerpt.revisionId,
          revision_content_hash: excerpt.revisionContentHash,
          source_start: excerpt.sourceStart,
          source_end: excerpt.sourceEnd,
          source_quote: excerpt.sourceQuote,
        }));
      }
    }
  }
  return structure;
}

export function localDraftContentHash(draft: LocalResumeDraft): string {
  return createHash("sha256").update(JSON.stringify({
    revision: draft.workspace.revision,
    structure: draft.workspace.structure,
    bindings: draft.workspace.bindings,
  })).digest("hex");
}

export function sourceExperienceIds(draft: LocalResumeDraft): string[] {
  return [...new Set(draft.workspace.structure.sections.flatMap((section) =>
    section.items.flatMap((item) => item.source_experience_id ?? [])
  ))];
}
