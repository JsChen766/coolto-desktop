import type { AgentTool } from "@earendil-works/pi-agent-core";

import type {
  CurrentUserReader,
  ExperienceReader,
  JdReader,
  UserProfileReader,
} from "../api/types.js";
import { ApprovalManager } from "../approvals/approval-manager.js";
import { SelectedFileRegistry } from "../files/selected-file-registry.js";
import { ExperienceImportProposalStore } from "../import/proposal-store.js";
import { JdProposalStore } from "../jd/proposal-store.js";
import type { ResumeSourceSnapshotBuilder } from "../resume/source-snapshot.js";
import type { ResumeCandidatePatcher } from "../resume/workspace/candidate-patcher.js";
import type { ResumeCandidatePreparer } from "../resume/workspace/candidate-preparer.js";
import type { ResumeCandidateReviewer } from "../resume/quality/candidate-reviewer.js";
import type { ResumeAlternativeRepairer } from "../resume/quality/alternative-repairer.js";
import type { ResumeSaveProposalBuilder } from "../resume/save/proposal-builder.js";
import type { ResumePublicationGateway } from "../resume/save/types.js";
import { createGetExperienceTool } from "./get-experience.js";
import { createGetCurrentUserTool } from "./get-current-user.js";
import { createGetResumeSourceSnapshotTool } from "./get-resume-source-snapshot.js";
import { createGetUserProfileTool } from "./get-user-profile.js";
import { createPrepareExperienceImportTool } from "./import-experiences/prepare-import.js";
import { createExtractPageTool } from "./extract-page.js";
import { createBrowserWriteTools } from "./browser/index.js";
import { createPrepareJdImportTool } from "./prepare-jd-import.js";
import { createRuntimeInfoTool } from "./runtime-info.js";
import { createJdTools } from "./jd-tools.js";
import { createSearchExperiencesTool } from "./search-experiences.js";
import { createSelectedFileTools } from "./selected-files.js";
import { createResumeCandidateTools } from "./resume-candidate/index.js";
import { createPrepareResumeSaveTool } from "./resume-candidate/prepare-save.js";
import { createResumeReadTools } from "./resume-tools.js";
import type { ResumePdfExportProposalBuilder } from "../resume/export/proposal-builder.js";
import { createPrepareResumePdfExportTool } from "./resume-candidate/prepare-pdf-export.js";
import { MatchReportStore } from "../match/report-store.js";
import { createPrepareMatchAnalysisTool } from "./prepare-match-analysis.js";
import type { BrowserPageOperator, BrowserPageReader } from "../browser/types.js";

export interface ToolRegistryDependencies {
  currentUserReader?: CurrentUserReader;
  userProfileReader?: UserProfileReader;
  experienceReader?: ExperienceReader;
  jdReader?: JdReader;
  resumeSourceSnapshotBuilder?: ResumeSourceSnapshotBuilder;
  resumeCandidatePreparer?: ResumeCandidatePreparer;
  resumeCandidatePatcher?: ResumeCandidatePatcher;
  resumeCandidateReviewer?: ResumeCandidateReviewer;
  resumeAlternativeRepairer?: ResumeAlternativeRepairer;
  resumeSaveProposalBuilder?: ResumeSaveProposalBuilder;
  resumePdfExportProposalBuilder?: ResumePdfExportProposalBuilder;
  resumeReader?: ResumePublicationGateway;
  importProposalStore?: ExperienceImportProposalStore;
  jdProposalStore?: JdProposalStore;
  approvalManager?: ApprovalManager;
  selectedFileRegistry?: SelectedFileRegistry;
  matchReportStore?: MatchReportStore;
  browserPageReader?: BrowserPageReader;
  browserPageOperator?: BrowserPageOperator;
}

/**
 * This is the only place where tools are exposed to the model.
 * Business tools will be added here after their API adapters and policies exist.
 */
export function createToolRegistry(
  dependencies: ToolRegistryDependencies = {},
): AgentTool[] {
  const businessTools: AgentTool[] = [];

  if (dependencies.currentUserReader) {
    businessTools.push(
      createGetCurrentUserTool(dependencies.currentUserReader),
    );
  }
  if (dependencies.userProfileReader) {
    businessTools.push(createGetUserProfileTool(dependencies.userProfileReader));
  }
  if (dependencies.jdReader) {
    businessTools.push(...createJdTools(dependencies.jdReader));
  }
  if (dependencies.resumeReader) {
    businessTools.push(...createResumeReadTools(dependencies.resumeReader));
  }
  if (dependencies.experienceReader) {
    businessTools.push(
      createSearchExperiencesTool(dependencies.experienceReader),
      createGetExperienceTool(dependencies.experienceReader),
    );
  }
  if (
    dependencies.experienceReader &&
    dependencies.importProposalStore &&
    dependencies.approvalManager
  ) {
    businessTools.push(
      createPrepareExperienceImportTool(
        dependencies.experienceReader,
        dependencies.importProposalStore,
        dependencies.approvalManager,
      ),
    );
  }
  if (dependencies.jdProposalStore && dependencies.approvalManager) {
    businessTools.push(
      createPrepareJdImportTool(
        dependencies.jdProposalStore,
        dependencies.approvalManager,
      ),
    );
  }
  if (dependencies.resumeSaveProposalBuilder && dependencies.approvalManager) {
    businessTools.push(
      createPrepareResumeSaveTool(
        dependencies.resumeSaveProposalBuilder,
        dependencies.approvalManager,
      ),
    );
  }
  if (
    dependencies.resumePdfExportProposalBuilder &&
    dependencies.approvalManager
  ) {
    businessTools.push(
      createPrepareResumePdfExportTool(
        dependencies.resumePdfExportProposalBuilder,
        dependencies.approvalManager,
      ),
    );
  }
  if (dependencies.resumeSourceSnapshotBuilder) {
    businessTools.push(
      createGetResumeSourceSnapshotTool(
        dependencies.resumeSourceSnapshotBuilder,
      ),
    );
  }
  if (
    dependencies.resumeCandidatePreparer &&
    dependencies.resumeCandidatePatcher &&
    dependencies.resumeCandidateReviewer &&
    dependencies.resumeAlternativeRepairer
  ) {
    businessTools.push(
      ...createResumeCandidateTools(
        dependencies.resumeCandidatePreparer,
        dependencies.resumeCandidatePatcher,
        dependencies.resumeCandidateReviewer,
        dependencies.resumeAlternativeRepairer,
      ),
    );
  }
  if (dependencies.selectedFileRegistry) {
    businessTools.push(
      ...createSelectedFileTools(dependencies.selectedFileRegistry),
    );
  }
  if (dependencies.jdReader && dependencies.matchReportStore) {
    businessTools.push(
      createPrepareMatchAnalysisTool(
        dependencies.jdReader,
        dependencies.matchReportStore,
      ),
    );
  }
  if (dependencies.browserPageReader) {
    businessTools.push(createExtractPageTool(dependencies.browserPageReader));
  }
  if (dependencies.browserPageOperator && dependencies.approvalManager) {
    businessTools.push(
      ...createBrowserWriteTools(
        dependencies.browserPageOperator,
        dependencies.approvalManager,
      ),
    );
  }

  return [
    createRuntimeInfoTool(businessTools.map((tool) => tool.name)),
    ...businessTools,
  ];
}
