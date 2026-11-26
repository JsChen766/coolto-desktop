import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { ToolRegistryDependencies } from "./tool-registry-dependencies.js";
import { createGetCurrentUserTool } from "./get-current-user.js";
import { createGetUserProfileTool } from "./get-user-profile.js";
import { createPrepareProfileUpdateTool } from "./prepare-profile-update.js";
import { createPrepareExperienceImportTool } from "./import-experiences/prepare-import.js";
import { createExtractPageTool } from "./extract-page.js";
import {
  createBrowserControlTools,
  createBrowserWriteTools,
} from "./browser/index.js";
import { createRecruitingFormTools } from "./browser/recruiting-form-tools.js";
import { createFetchPublicHttpsTextTool } from "./fetch-public-https-text.js";
import { createPrepareJdImportTool } from "./prepare-jd-import.js";
import { createRuntimeInfoTool } from "./runtime-info.js";
import { createJdTools } from "./jd-tools.js";
import { createSyncNowTool } from "./sync-now.js";
import { createResumeReadTools } from "./resume-tools.js";
import { createPrepareMatchAnalysisTool } from "./prepare-match-analysis.js";
import { createAgentOrchestratedTools } from "./agent-orchestrated/index.js";
import { ExperienceReferenceRegistry } from "./experience-reference-registry.js";
import { applyToolCapabilities } from "./tool-capabilities.js";
import type { CapabilityAgentTool } from "./tool-capabilities.js";
import { createExperienceTools } from "./experience-tool-registry.js";
import { createAgentTaskLifecycleTools } from "./agent-task-lifecycle.js";
import { createPrepareAgentTaskTool } from "./prepare-agent-task.js";
import { createPrepareAiNativeLoopTools } from "./prepare-ai-native-loops.js";
import { createAiNativeTools } from "./ai-native-tool-registry.js";
import { applyExecutionPolicies } from "./tool-execution-policies.js";
import { createJobScoutTools } from "./job-scout-tools.js";
import { createApplicationSubmissionTools } from "./application-submission-tools.js";
import { createAnswerVaultTools } from "./answer-vault-tools.js";
import { createInboxTools } from "./inbox-tool-registry.js";
import { createLocalFileTools } from "./local-file-tools.js";
import { createPreferenceTools } from "./preference-tool-registry.js";

export type { ToolRegistryDependencies } from "./tool-registry-dependencies.js";

export function createToolRegistry(
  dependencies: ToolRegistryDependencies = {},
): CapabilityAgentTool[] {
  const experienceReferences = new ExperienceReferenceRegistry(() =>
    dependencies.agentOrchestrated?.store.latest()?.sourceSnapshot.experiences
      .map((experience) => experience.id)
  );
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
  businessTools.push(...createPreferenceTools(dependencies));
  if (dependencies.jdReader) {
    businessTools.push(...createJdTools(dependencies.jdReader));
  }
  if (dependencies.resumeReader) {
    businessTools.push(...createResumeReadTools(dependencies.resumeReader, dependencies.jdReader, dependencies.agentOrchestrated?.resumeDraftReader));
  }
  businessTools.push(...createExperienceTools(dependencies));
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
      createFetchPublicHttpsTextTool(),
    );
  }
  businessTools.push(...createLocalFileTools(dependencies));
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
        dependencies.matchModelId ? { modelId: dependencies.matchModelId } : {},
      ),
    );
  }
  if (dependencies.browserPageReader) {
    businessTools.push(createExtractPageTool(dependencies.browserPageReader));
  }
  if (dependencies.browserAgentController && dependencies.browserPageOperator &&
      dependencies.approvalManager) {
    businessTools.push(
      ...createBrowserControlTools(dependencies.browserAgentController),
      ...createRecruitingFormTools({
        browser: dependencies.browserAgentController, operator: dependencies.browserPageOperator,
        ...(dependencies.selectedFileRegistry ? { selectedFiles: dependencies.selectedFileRegistry } : {}),
      }),
    );
  }
  if (dependencies.jobScout) {
    businessTools.push(...createJobScoutTools(
      dependencies.jobScout, dependencies.browserAgentController,
    ));
  }
  if (dependencies.applicationSubmission && dependencies.approvalManager) {
    businessTools.push(...createApplicationSubmissionTools(
      dependencies.applicationSubmission, dependencies.approvalManager,
    ));
  }
  businessTools.push(...createAiNativeTools(dependencies));
  if (dependencies.answerVault) {
    businessTools.push(...createAnswerVaultTools({
      store: dependencies.answerVault,
      ...(dependencies.approvalManager
        ? { approvals: dependencies.approvalManager }
        : {}),
    }));
  }
  businessTools.push(...createInboxTools(dependencies));
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
  if (dependencies.agentTaskLifecycle) {
    businessTools.push(
      ...createAgentTaskLifecycleTools(dependencies.agentTaskLifecycle),
    );
  }
  if (
    dependencies.agentTaskProposals &&
    dependencies.conversationId &&
    dependencies.approvalManager
  ) {
    businessTools.push(createPrepareAgentTaskTool({
      conversationId: dependencies.conversationId,
      proposals: dependencies.agentTaskProposals,
      approvals: dependencies.approvalManager,
    }));
    businessTools.push(...createPrepareAiNativeLoopTools({
      conversationId: dependencies.conversationId,
      proposals: dependencies.agentTaskProposals,
      approvals: dependencies.approvalManager,
      ...(dependencies.resumeReader ? { resumes: dependencies.resumeReader } : {}),
      ...(dependencies.inboxSignals ? { inboxSignals: dependencies.inboxSignals } : {}),
    }));
  }

  return applyToolCapabilities(
    applyExecutionPolicies([
      createRuntimeInfoTool(businessTools.map((tool) => tool.name)),
      ...businessTools,
    ]).map((tool) => experienceReferences.wrap(tool)),
  );
}
