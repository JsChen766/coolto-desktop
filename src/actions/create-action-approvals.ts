import type { ExperienceWriter, JdWriter } from "../api/types.js";
import { ApprovalManager } from "../approvals/approval-manager.js";
import { ApprovalStore } from "../approvals/approval-store.js";
import { ActionExecutorRegistry } from "../approvals/executor-registry.js";
import type { BrowserPageOperator } from "../browser/types.js";
import { createBrowserWriteAccessExecutor } from "../browser/browser-write-access-executor.js";
import { BROWSER_WRITE_ACCESS_ACTION_TYPE } from "../browser/write-access-approval.js";
import {
  EXPERIENCE_IMPORT_ACTION_TYPE,
} from "../import/approval-draft.js";
import { ExperienceImportProposalStore } from "../import/proposal-store.js";
import { createExperienceImportExecutor } from "./experience-import-executor.js";
import type { ProfileProposalExecutor } from "../profile/types.js";
import { JD_SAVE_ACTION_TYPE } from "../jd/approval-draft.js";
import { JdProposalStore } from "../jd/proposal-store.js";
import { createJdSaveExecutor } from "../jd/jd-save-executor.js";
import type { ResumePublicationGateway } from "../resume/save/types.js";
import { RESUME_SAVE_ACTION_TYPE } from "../resume/save/approval-draft.js";
import { createResumeSaveExecutor } from "../resume/save/save-executor.js";
import type { ResumePdfExportGateway } from "../resume/export/types.js";
import { RESUME_PDF_EXPORT_ACTION_TYPE } from "../resume/export/approval-draft.js";
import { createResumePdfExportExecutor } from "../resume/export/export-executor.js";

export interface ActionApprovalDependencies {
  experienceWriter: ExperienceWriter;
  importProposalStore: ExperienceImportProposalStore;
  profileProposals?: ProfileProposalExecutor;
  jdWriter?: JdWriter;
  jdProposalStore?: JdProposalStore;
  resumePublications?: ResumePublicationGateway;
  resumePdfExports?: ResumePdfExportGateway;
  browserPageOperator?: BrowserPageOperator;
}

export function createActionApprovalManager(
  deps: ActionApprovalDependencies,
): ApprovalManager {
  const executors = new ActionExecutorRegistry();
  executors.register(
    EXPERIENCE_IMPORT_ACTION_TYPE,
    createExperienceImportExecutor(
      deps.experienceWriter,
      deps.importProposalStore,
      deps.profileProposals,
    ),
  );
  if (deps.jdWriter && deps.jdProposalStore) {
    executors.register(
      JD_SAVE_ACTION_TYPE,
      createJdSaveExecutor(deps.jdWriter, deps.jdProposalStore),
    );
  }
  if (deps.resumePublications) {
    executors.register(
      RESUME_SAVE_ACTION_TYPE,
      createResumeSaveExecutor(deps.resumePublications),
    );
  }
  if (deps.resumePdfExports) {
    executors.register(
      RESUME_PDF_EXPORT_ACTION_TYPE,
      createResumePdfExportExecutor(deps.resumePdfExports),
    );
  }
  if (deps.browserPageOperator) {
    executors.register(
      BROWSER_WRITE_ACCESS_ACTION_TYPE,
      createBrowserWriteAccessExecutor(deps.browserPageOperator),
    );
  }
  return new ApprovalManager(new ApprovalStore(), executors);
}
