import type { ExperienceWriter } from "../api/types.js";
import { ApprovalManager } from "../approvals/approval-manager.js";
import { ApprovalStore } from "../approvals/approval-store.js";
import { ActionExecutorRegistry } from "../approvals/executor-registry.js";
import {
  EXPERIENCE_IMPORT_ACTION_TYPE,
} from "../import/approval-draft.js";
import { ExperienceImportProposalStore } from "../import/proposal-store.js";
import { createExperienceImportExecutor } from "./experience-import-executor.js";

export function createActionApprovalManager(
  experienceWriter: ExperienceWriter,
  importProposalStore: ExperienceImportProposalStore,
): ApprovalManager {
  const executors = new ActionExecutorRegistry();
  executors.register(
    EXPERIENCE_IMPORT_ACTION_TYPE,
    createExperienceImportExecutor(
      experienceWriter,
      importProposalStore,
    ),
  );
  return new ApprovalManager(new ApprovalStore(), executors);
}
