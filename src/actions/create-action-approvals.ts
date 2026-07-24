import type { ExperienceWriter } from "../api/types.js";
import { ApprovalManager } from "../approvals/approval-manager.js";
import { ApprovalStore } from "../approvals/approval-store.js";
import { ActionExecutorRegistry } from "../approvals/executor-registry.js";
import {
  EXPERIENCE_IMPORT_ACTION_TYPE,
} from "../import/approval-draft.js";
import { ExperienceImportProposalStore } from "../import/proposal-store.js";
import { createExperienceImportExecutor } from "./experience-import-executor.js";
import type { ResumePublicationGateway } from "../resume/save/types.js";
import { RESUME_SAVE_ACTION_TYPE } from "../resume/save/approval-draft.js";
import { createResumeSaveExecutor } from "../resume/save/save-executor.js";
import type { ResumePdfExportGateway } from "../resume/export/types.js";
import { RESUME_PDF_EXPORT_ACTION_TYPE } from "../resume/export/approval-draft.js";
import { createResumePdfExportExecutor } from "../resume/export/export-executor.js";

export function createActionApprovalManager(
  experienceWriter: ExperienceWriter,
  importProposalStore: ExperienceImportProposalStore,
  resumePublications?: ResumePublicationGateway,
  resumePdfExports?: ResumePdfExportGateway,
): ApprovalManager {
  const executors = new ActionExecutorRegistry();
  executors.register(
    EXPERIENCE_IMPORT_ACTION_TYPE,
    createExperienceImportExecutor(
      experienceWriter,
      importProposalStore,
    ),
  );
  if (resumePublications) {
    executors.register(
      RESUME_SAVE_ACTION_TYPE,
      createResumeSaveExecutor(resumePublications),
    );
  }
  if (resumePdfExports) {
    executors.register(
      RESUME_PDF_EXPORT_ACTION_TYPE,
      createResumePdfExportExecutor(resumePdfExports),
    );
  }
  return new ApprovalManager(new ApprovalStore(), executors);
}
