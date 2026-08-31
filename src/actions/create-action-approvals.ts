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
import {
  PROFILE_UPDATE_ACTION_TYPE,
} from "../profile/approval-draft.js";
import { createProfileUpdateExecutor } from "./profile-update-executor.js";
import {
  RESUME_AUGMENTED_CONFIRM_ACTION_TYPE,
} from "../resume/confirmation/augmented-approval.js";
import { createAugmentedConfirmationExecutor } from "../resume/confirmation/augmented-executor.js";
import type { ResumeCompiler } from "../resume/workspace/compiler-port.js";
import type { ResumeWorkspaceStore } from "../resume/workspace/workspace-store.js";
import {
  RESUME_EXPERIENCE_SYNC_ACTION_TYPE,
} from "../resume/material/experience-sync-approval.js";
import { createResumeExperienceSyncExecutor } from "../resume/material/experience-sync-executor.js";
import type {
  ResumeExperienceSyncDraftPort,
  ResumeExperienceSyncProposalPort,
} from "../resume/material/experience-sync-port.js";
import type { AgentTaskProposalService } from "../desktop/main/agent-task/agent-task-proposal-service.js";
import { AGENT_TASK_PROVISION_ACTION } from "../desktop/main/agent-task/agent-task-approval.js";
import { createAgentTaskApprovalExecutor } from "../desktop/main/agent-task/agent-task-approval-executor.js";
import type { AnswerVaultStore } from "../agent-task/answer-vault-store.js";
import { ANSWER_VAULT_UPSERT_ACTION } from "../agent-task/answer-vault-approval.js";
import { createAnswerVaultApprovalExecutor } from "../agent-task/answer-vault-approval-executor.js";
import type { InboxSignalApplicationService } from "../desktop/main/agent-task/inbox-signal-application-service.js";
import { INBOX_APPLICATION_UPDATE_ACTION } from "../inbox-signals/inbox-action-approval.js";
import { createInboxApplicationApprovalExecutor } from "../inbox-signals/inbox-action-approval-executor.js";
import type { InboxSignalInterviewService } from "../desktop/main/agent-task/inbox-signal-interview-service.js";
import { INBOX_INTERVIEW_UPDATE_ACTION } from "../inbox-signals/inbox-action-approval.js";
import { createInboxInterviewApprovalExecutor } from "../inbox-signals/inbox-action-approval-executor.js";
import {
  createResumeStrategyChoiceExecutor,
  RESUME_STRATEGY_CHOICE_ACTION,
} from "../resume/strategy/choice-approval.js";
import type { ApplicationSubmissionService } from
  "../desktop/main/agent-task/application-submission-service.js";
import { createSubmissionApprovalExecutor } from
  "../agent-task/submission-approval-executor.js";
import { SUBMISSION_CONFIRM_ACTION } from "../agent-task/submission-approval.js";
import type { AiNativeLoopService } from
  "../desktop/main/agent-task/ai-native-loop-service.js";
import { createLoopReminderApprovalExecutor } from
  "../agent-task/loop-reminder-approval-executor.js";
import { LOOP_REMINDER_ACTION } from "../agent-task/loop-reminder-approval.js";

export interface ActionApprovalDependencies {
  experienceWriter: ExperienceWriter;
  importProposalStore: ExperienceImportProposalStore;
  profileProposals?: ProfileProposalExecutor;
  jdWriter?: JdWriter;
  jdProposalStore?: JdProposalStore;
  resumePublications?: ResumePublicationGateway;
  resumePdfExports?: ResumePdfExportGateway;
  browserPageOperator?: BrowserPageOperator;
  resumeWorkspaceStore?: ResumeWorkspaceStore;
  resumeCompiler?: ResumeCompiler;
  resumeExperienceSyncProposals?: ResumeExperienceSyncProposalPort;
  resumeDrafts?: ResumeExperienceSyncDraftPort;
  agentTaskProposals?: AgentTaskProposalService;
  answerVault?: AnswerVaultStore;
  inboxApplicationProposals?: InboxSignalApplicationService;
  inboxInterviewProposals?: InboxSignalInterviewService;
  applicationSubmissions?: ApplicationSubmissionService;
  aiNativeLoops?: AiNativeLoopService;
}

export function createActionApprovalManager(
  deps: ActionApprovalDependencies,
): ApprovalManager {
  const executors = new ActionExecutorRegistry();
  executors.register(
    RESUME_STRATEGY_CHOICE_ACTION,
    createResumeStrategyChoiceExecutor(),
  );
  executors.register(
    EXPERIENCE_IMPORT_ACTION_TYPE,
    createExperienceImportExecutor(
      deps.experienceWriter,
      deps.importProposalStore,
      deps.profileProposals,
    ),
  );
  if (deps.profileProposals) {
    executors.register(
      PROFILE_UPDATE_ACTION_TYPE,
      createProfileUpdateExecutor(deps.profileProposals),
    );
  }
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
  if (deps.resumeWorkspaceStore && deps.resumeCompiler) {
    executors.register(
      RESUME_AUGMENTED_CONFIRM_ACTION_TYPE,
      createAugmentedConfirmationExecutor(
        deps.resumeWorkspaceStore,
        deps.resumeCompiler,
      ),
    );
  }
  if (deps.resumeExperienceSyncProposals) {
    executors.register(
      RESUME_EXPERIENCE_SYNC_ACTION_TYPE,
      createResumeExperienceSyncExecutor(
        deps.resumeExperienceSyncProposals,
        deps.resumeDrafts,
      ),
    );
  }
  if (deps.agentTaskProposals) {
    executors.register(
      AGENT_TASK_PROVISION_ACTION,
      createAgentTaskApprovalExecutor(deps.agentTaskProposals),
    );
  }
  if (deps.answerVault) {
    executors.register(
      ANSWER_VAULT_UPSERT_ACTION,
      createAnswerVaultApprovalExecutor(deps.answerVault),
    );
  }
  if (deps.inboxApplicationProposals) {
    executors.register(
      INBOX_APPLICATION_UPDATE_ACTION,
      createInboxApplicationApprovalExecutor(deps.inboxApplicationProposals),
    );
  }
  if (deps.inboxInterviewProposals) {
    executors.register(
      INBOX_INTERVIEW_UPDATE_ACTION,
      createInboxInterviewApprovalExecutor(deps.inboxInterviewProposals),
    );
  }
  if (deps.applicationSubmissions) {
    executors.register(
      SUBMISSION_CONFIRM_ACTION,
      createSubmissionApprovalExecutor(deps.applicationSubmissions),
    );
  }
  if (deps.aiNativeLoops) {
    executors.register(
      LOOP_REMINDER_ACTION,
      createLoopReminderApprovalExecutor(deps.aiNativeLoops),
    );
  }
  return new ApprovalManager(new ApprovalStore(), executors);
}
