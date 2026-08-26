import { createHash } from "node:crypto";

import type { ApprovalManager } from "../../../approvals/approval-manager.js";
import type { LocalResumeDraft } from "../../../resume/draft/types.js";
import {
  createExperienceSyncApprovalDraft,
  createExperienceSyncPayload,
} from "../../../resume/material/experience-sync-approval.js";
import { prepareExperienceSyncProposals } from
  "../../../resume/material/experience-sync-preparer.js";
import type { ResumeExperienceSyncProposalPort } from
  "../../../resume/material/experience-sync-port.js";
import type { ResumeExperienceSyncDraftPort } from
  "../../../resume/material/experience-sync-port.js";
import { resumeGenerationReadiness } from
  "../../../resume/workspace/generation-readiness.js";

export async function requestDraftExperienceSyncApproval(input: {
  draft: LocalResumeDraft;
  drafts: ResumeExperienceSyncDraftPort;
  proposals: ResumeExperienceSyncProposalPort;
  approvals: ApprovalManager;
}): Promise<LocalResumeDraft> {
  const { draft, drafts } = input;
  if (!resumeGenerationReadiness(draft.workspace).ready) return draft;
  const evidenceFingerprint = supplementalFingerprint(draft);
  if (!evidenceFingerprint ||
    draft.experienceSync?.evidenceFingerprint === evidenceFingerprint) {
    return draft;
  }
  let prepared;
  try {
    prepared = await prepareExperienceSyncProposals(
      draft.workspace,
      input.proposals,
    );
  } catch {
    return drafts.markExperienceSync(draft.artifactId, {
      evidenceFingerprint,
      status: "stale",
      updatedAt: new Date().toISOString(),
    });
  }
  const approval = await input.approvals.request(
    createExperienceSyncApprovalDraft(prepared),
    createExperienceSyncPayload(prepared, {
      artifactId: draft.artifactId,
      evidenceFingerprint,
    }),
  );
  return drafts.markExperienceSync(draft.artifactId, {
    evidenceFingerprint,
    status: "pending_approval",
    approvalRequestId: approval.id,
    updatedAt: new Date().toISOString(),
  });
}

function supplementalFingerprint(draft: LocalResumeDraft): string | undefined {
  const values = (draft.workspace.supplementalEvidence ?? [])
    .map((item) => `${item.evidenceId}\0${item.experienceId}\0${item.text}`)
    .sort();
  return values.length
    ? createHash("sha256").update(values.join("\n")).digest("hex")
    : undefined;
}
