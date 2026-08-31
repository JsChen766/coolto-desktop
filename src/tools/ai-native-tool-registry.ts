import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { AiNativeLoopService } from
  "../desktop/main/agent-task/ai-native-loop-service.js";
import type { ManagedResumeUploadService } from
  "../desktop/main/agent-task/managed-resume-upload-service.js";
import { createAiNativeLoopTools } from "./ai-native-loop-tools.js";
import { createManagedResumeUploadTool } from "./managed-resume-upload-tool.js";
import type { ApprovalManager } from "../approvals/approval-manager.js";
import type { AgentTaskProposalService } from
  "../desktop/main/agent-task/agent-task-proposal-service.js";
import type { ApplicationSyncStore } from
  "../desktop/main/application-library/application-sync-store.js";
import type { InterviewSyncStore } from
  "../desktop/main/tracker/interview-sync-store.js";
import type { InboxSignalController } from
  "../inbox-signals/inbox-signal-controller.js";
import { createPrepareExtendedLoopTools } from
  "./prepare-ai-native-extended-loops.js";

export interface AiNativeToolDependencies {
  aiNativeLoops?: AiNativeLoopService;
  managedResumeUploads?: ManagedResumeUploadService;
  conversationId?: string;
  approvalManager?: ApprovalManager;
  agentTaskProposals?: AgentTaskProposalService;
  applications?: ApplicationSyncStore;
  interviews?: InterviewSyncStore;
  inboxSignals?: InboxSignalController;
}

export function createAiNativeTools(
  dependencies: AiNativeToolDependencies,
): AgentTool[] {
  return [
    ...(dependencies.managedResumeUploads && dependencies.conversationId
      ? [createManagedResumeUploadTool(
          dependencies.managedResumeUploads, dependencies.conversationId,
        )]
      : []),
    ...(dependencies.aiNativeLoops
      ? createAiNativeLoopTools(dependencies.aiNativeLoops, dependencies.approvalManager) : []),
    ...(dependencies.conversationId && dependencies.approvalManager &&
      dependencies.agentTaskProposals && dependencies.applications &&
      dependencies.interviews && dependencies.inboxSignals
      ? createPrepareExtendedLoopTools({
          conversationId: dependencies.conversationId,
          proposals: dependencies.agentTaskProposals,
          approvals: dependencies.approvalManager,
          applications: dependencies.applications,
          interviews: dependencies.interviews,
          inboxSignals: dependencies.inboxSignals,
        })
      : []),
  ];
}
