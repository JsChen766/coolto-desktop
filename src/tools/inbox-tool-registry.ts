import type { AgentTool } from "@earendil-works/pi-agent-core";

import type { ApprovalManager } from "../approvals/approval-manager.js";
import type { InboxApplicationCandidateReader } from
  "../inbox-signals/inbox-application-candidate-reader.js";
import type { InboxSignalController } from
  "../inbox-signals/inbox-signal-controller.js";
import type { InboxSignalApplicationService } from
  "../desktop/main/agent-task/inbox-signal-application-service.js";
import type { InboxSignalInterviewService } from
  "../desktop/main/agent-task/inbox-signal-interview-service.js";
import { createPrepareInboxApplicationTool } from "./inbox-action-tools.js";
import { createPrepareInboxInterviewTool } from "./inbox-interview-tools.js";
import { createInboxSignalTools } from "./inbox-signal-tools.js";

export interface InboxToolRegistryDependencies {
  approvalManager?: ApprovalManager;
  inboxSignals?: InboxSignalController;
  inboxApplicationCandidates?: InboxApplicationCandidateReader;
  inboxApplicationProposals?: InboxSignalApplicationService;
  inboxInterviewProposals?: InboxSignalInterviewService;
}

export function createInboxTools(
  dependencies: InboxToolRegistryDependencies,
): AgentTool[] {
  const tools: AgentTool[] = [];
  if (dependencies.inboxSignals && dependencies.inboxApplicationCandidates) {
    tools.push(...createInboxSignalTools(
      dependencies.inboxSignals,
      dependencies.inboxApplicationCandidates,
    ));
  }
  if (dependencies.inboxApplicationProposals && dependencies.approvalManager) {
    tools.push(createPrepareInboxApplicationTool({
      proposals: dependencies.inboxApplicationProposals,
      approvals: dependencies.approvalManager,
    }));
  }
  if (dependencies.inboxInterviewProposals && dependencies.approvalManager) {
    tools.push(createPrepareInboxInterviewTool({
      proposals: dependencies.inboxInterviewProposals,
      approvals: dependencies.approvalManager,
    }));
  }
  return tools;
}
