import type { ExperienceCreateInput } from "../../../api/types.js";
import type { ExperienceProposalSnapshot } from "../../../experience/maintenance-types.js";
import { validateExperienceSnapshot } from "../../../experience/validation.js";
import { createUuidV7 } from "../../../sync/uuid-v7.js";
import type { ExperienceExecution } from "./experience-mutation-executor.js";
import { proposalSnapshot } from "./experience-proposal-mapping.js";
import {
  buildLocalExperience,
  toExperienceDetail,
  toExperienceWritePayload,
} from "./experience-sync-mapping.js";

export interface ExperienceCreateProposalDraft {
  experienceId: string;
  next: ExperienceProposalSnapshot;
  execution: ExperienceExecution;
}

export function buildExperienceCreateProposal(
  input: ExperienceCreateInput,
): ExperienceCreateProposalDraft {
  const experienceId = createUuidV7();
  const revisionId = createUuidV7();
  const now = new Date().toISOString();
  const normalized = { ...input, status: "active" as const };
  const localPayload = buildLocalExperience(
    experienceId,
    revisionId,
    normalized,
    now,
  );
  const next = proposalSnapshot(toExperienceDetail({
    entityType: "experience",
    entityId: experienceId,
    entityVersion: 0,
    localVersion: 0,
    syncStatus: "pending",
    operation: "upsert",
    changedAt: now,
    payload: localPayload,
  }));
  validateExperienceSnapshot(next);
  return {
    experienceId,
    next,
    execution: {
      mode: "enqueue",
      mutation: {
        operationId: createUuidV7(),
        entityType: "experience",
        entityId: experienceId,
        action: "create",
        expectedVersion: null,
        payload: toExperienceWritePayload(normalized, revisionId),
        localPayload,
        createdAt: now,
      },
    },
  };
}
