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
import type { ResumeLayoutInspector } from "../resume/planning/layout-inspector.js";
import type { ResumeCandidateReviewer } from "../resume/quality/candidate-reviewer.js";
import type { ResumeAlternativeRepairer } from "../resume/quality/alternative-repairer.js";
import type { ResumeSaveProposalBuilder } from "../resume/save/proposal-builder.js";
import type { ResumePublicationGateway } from "../resume/save/types.js";
import { createGetExperienceTool } from "./get-experience.js";
import { createGetCurrentUserTool } from "./get-current-user.js";
import { createGetResumeSourceSnapshotTool } from "./get-resume-source-snapshot.js";
import { createGetUserProfileTool } from "./get-user-profile.js";
import { createPrepareProfileUpdateTool } from "./prepare-profile-update.js";
import { createPrepareExperienceImportTool } from "./import-experiences/prepare-import.js";
import { createExtractPageTool } from "./extract-page.js";
import { createBrowserWriteTools } from "./browser/index.js";
import { createPrepareJdImportTool } from "./prepare-jd-import.js";
import { createRuntimeInfoTool } from "./runtime-info.js";
import { createJdTools } from "./jd-tools.js";
import { createSearchExperiencesTool } from "./search-experiences.js";
import { createSyncNowTool, type SyncNowResult } from "./sync-now.js";
import { createSelectedFileTools } from "./selected-files.js";
import { createResumePatchTools } from "./resume-candidate/index.js";
import { createInspectResumeLayoutTool } from "./planned-resume/inspect-layout.js";
import { createPrepareResumeSaveTool } from "./resume-candidate/prepare-save.js";
import { createResumeReadTools } from "./resume-tools.js";
import type { ResumePdfExportProposalBuilder } from "../resume/export/proposal-builder.js";
import { createPrepareResumePdfExportTool } from "./resume-candidate/prepare-pdf-export.js";
import { MatchReportStore } from "../match/report-store.js";
import { createPrepareMatchAnalysisTool } from "./prepare-match-analysis.js";
import type { BrowserPageOperator, BrowserPageReader } from "../browser/types.js";
import {
  createAgentOrchestratedTools,
  type AgentOrchestratedDependencies,
} from "./agent-orchestrated/index.js";
import type { ProfileProposalExecutor } from "../profile/types.js";

export interface ToolRegistryDependencies {
  currentUserReader?: CurrentUserReader;
  userProfileReader?: UserProfileReader;
  profileProposals?: ProfileProposalExecutor;
  experienceReader?: ExperienceReader;
  jdReader?: JdReader;
  resumeSourceSnapshotBuilder?: ResumeSourceSnapshotBuilder;
  resumeLayoutInspector?: ResumeLayoutInspector;
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
  agentOrchestrated?: AgentOrchestratedDependencies;
  /** Immediately runs one sync round; resolves with a result summary. */
  syncNow?: () => Promise<SyncNowResult>;
}

/**
 * This is the only place where tools are exposed to the model.
 * Business tools will be added here after their API adapters and policies exist.
 */
export function createToolRegistry(
  dependencies: ToolRegistryDependencies = {},
): AgentTool[] {
  const businessTools: AgentTool[] = [];

  if (dependencies.syncNow) {
    businessTools.push(createSyncNowTool(dependencies.syncNow));
  }
  if (dependencies.currentUserReader) {
    businessTools.push(
      createGetCurrentUserTool(dependencies.currentUserReader),
    );
  }
  if (dependencies.userProfileReader) {
    businessTools.push(createGetUserProfileTool(dependencies.userProfileReader));
  }
  if (
    dependencies.userProfileReader &&
    dependencies.profileProposals &&
    dependencies.approvalManager
  ) {
    businessTools.push(
      createPrepareProfileUpdateTool(
        dependencies.userProfileReader,
        dependencies.profileProposals,
        dependencies.approvalManager,
      ),
    );
  }
  if (dependencies.jdReader) {
    businessTools.push(...createJdTools(dependencies.jdReader));
  }
  if (dependencies.resumeReader) {
    businessTools.push(...createResumeReadTools(dependencies.resumeReader));
  }
  if (dependencies.resumeLayoutInspector) {
    businessTools.push(
      createInspectResumeLayoutTool(dependencies.resumeLayoutInspector),
    );
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
        dependencies.userProfileReader,
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
    dependencies.resumeCandidatePatcher &&
    dependencies.resumeCandidateReviewer &&
    dependencies.resumeAlternativeRepairer
  ) {
    businessTools.push(
      ...createResumePatchTools(
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
  if (
    dependencies.jdReader &&
    dependencies.experienceReader &&
    dependencies.matchReportStore
  ) {
    businessTools.push(
      createPrepareMatchAnalysisTool(
        dependencies.jdReader,
        dependencies.experienceReader,
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
  if (dependencies.agentOrchestrated) {
    businessTools.push(
      ...createAgentOrchestratedTools(dependencies.agentOrchestrated),
    );
  }

  return [
    createRuntimeInfoTool(businessTools.map((tool) => tool.name)),
    ...businessTools,
  ];
}
