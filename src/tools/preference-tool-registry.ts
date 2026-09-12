import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { ApprovalManager } from "../approvals/approval-manager.js";
import type { PreferenceProposalService } from "../desktop/main/preference/preference-proposal-service.js";
import type { PreferenceSuggestionStore } from "../desktop/main/agent-task/preference-suggestion-store.js";
import { createGetPreferencesTool } from "./get-preferences.js";
import { createPreparePreferenceChangeTool } from "./prepare-preference-change.js";
import { createResolvePreferencesTool } from "./resolve-preferences.js";
import type { PreferenceReaderV1 } from "../preference/types.js";

export interface PreferenceToolDependencies {
  preferences?: PreferenceReaderV1;
  preferenceProposals?: PreferenceProposalService;
  preferenceUsage?: PreferenceSuggestionStore;
  preferenceOwnerId?: string;
  conversationId?: string;
  approvalManager?: ApprovalManager;
}

export function createPreferenceTools(
  dependencies: PreferenceToolDependencies,
): AgentTool[] {
  const tools: AgentTool[] = [];
  const reader = dependencies.preferences;
  if (reader) {
    tools.push(createGetPreferencesTool(reader, dependencies.preferenceUsage));
    if (dependencies.preferenceOwnerId && dependencies.conversationId) {
      tools.push(createResolvePreferencesTool(
        dependencies.preferenceOwnerId,
        dependencies.conversationId,
        reader,
        dependencies.preferenceUsage,
      ));
    }
  }
  if (dependencies.preferenceProposals && dependencies.approvalManager) {
    tools.push(createPreparePreferenceChangeTool(
      dependencies.preferenceProposals,
      dependencies.approvalManager,
    ));
  }
  return tools;
}
