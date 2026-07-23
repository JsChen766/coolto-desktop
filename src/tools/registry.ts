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
import type { ResumeSourceSnapshotBuilder } from "../resume/source-snapshot.js";
import type { ResumeCandidatePatcher } from "../resume/workspace/candidate-patcher.js";
import type { ResumeCandidatePreparer } from "../resume/workspace/candidate-preparer.js";
import { createGetExperienceTool } from "./get-experience.js";
import { createGetCurrentUserTool } from "./get-current-user.js";
import { createGetResumeSourceSnapshotTool } from "./get-resume-source-snapshot.js";
import { createGetUserProfileTool } from "./get-user-profile.js";
import { createPrepareExperienceImportTool } from "./import-experiences/prepare-import.js";
import { createRuntimeInfoTool } from "./runtime-info.js";
import { createJdTools } from "./jd-tools.js";
import { createSearchExperiencesTool } from "./search-experiences.js";
import { createSelectedFileTools } from "./selected-files.js";
import { createResumeCandidateTools } from "./resume-candidate/index.js";

export interface ToolRegistryDependencies {
  currentUserReader?: CurrentUserReader;
  userProfileReader?: UserProfileReader;
  experienceReader?: ExperienceReader;
  jdReader?: JdReader;
  resumeSourceSnapshotBuilder?: ResumeSourceSnapshotBuilder;
  resumeCandidatePreparer?: ResumeCandidatePreparer;
  resumeCandidatePatcher?: ResumeCandidatePatcher;
  importProposalStore?: ExperienceImportProposalStore;
  approvalManager?: ApprovalManager;
  selectedFileRegistry?: SelectedFileRegistry;
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
  if (dependencies.resumeSourceSnapshotBuilder) {
    businessTools.push(
      createGetResumeSourceSnapshotTool(
        dependencies.resumeSourceSnapshotBuilder,
      ),
    );
  }
  if (
    dependencies.resumeCandidatePreparer &&
    dependencies.resumeCandidatePatcher
  ) {
    businessTools.push(
      ...createResumeCandidateTools(
        dependencies.resumeCandidatePreparer,
        dependencies.resumeCandidatePatcher,
      ),
    );
  }
  if (dependencies.selectedFileRegistry) {
    businessTools.push(
      ...createSelectedFileTools(dependencies.selectedFileRegistry),
    );
  }

  return [
    createRuntimeInfoTool(businessTools.map((tool) => tool.name)),
    ...businessTools,
  ];
}
