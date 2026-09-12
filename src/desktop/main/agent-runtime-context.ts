import type { CooltoAgent } from "../../agent/coolto-agent.js";
import type {
  CompactionDependencies,
  ProfilePreferenceCompactionAuthority,
} from "./context-compaction.js";
import { JdProposalStore } from "../../jd/proposal-store.js";
import { MatchReportStore } from "../../match/report-store.js";
import type { ResumeCompiler } from "../../resume/workspace/compiler-port.js";
import type { ResumePublicationGateway } from "../../resume/save/types.js";
import type { ResumeSourceSnapshotBuilder } from "../../resume/source-snapshot.js";
import type { ResumeWorkspace } from "../../resume/workspace/types.js";
import { ResumeWorkspaceStore } from "../../resume/workspace/workspace-store.js";
import type { ApprovalManager } from "../../approvals/approval-manager.js";
import type { ResumeExperienceSyncProposalPort } from "../../resume/material/experience-sync-port.js";
import type { PreferenceReaderV1, PreferenceResolutionV1 } from "../../preference/types.js";
import type { PreferenceSuggestionStore } from "./agent-task/preference-suggestion-store.js";
import type { CapabilityStage } from "../../agent-task/capability-stage-types.js";
export interface ProfilePreferenceAuthority extends ProfilePreferenceCompactionAuthority {
  targetFingerprint: string | null;
  profileLocalVersion?: number;
  resolution: PreferenceResolutionV1;
}

export interface ConversationAgentContext {
  agent: CooltoAgent;
  sourceBuilder: ResumeSourceSnapshotBuilder;
  resumeReader: Pick<ResumePublicationGateway, "getResume">;
  workspaceStore: ResumeWorkspaceStore;
  resumeCompiler: ResumeCompiler;
  jdProposalStore: JdProposalStore;
  matchReportStore: MatchReportStore;
  scopeTools: () => Promise<void>;
  approvalManager: ApprovalManager;
  experienceSyncProposals: ResumeExperienceSyncProposalPort;
  preferences: PreferenceReaderV1;
  preferenceSuggestions: PreferenceSuggestionStore;
  advanceTaskStage?: (to: CapabilityStage, reason: string) => Promise<void>;
  profilePreferenceAuthority?: ProfilePreferenceAuthority;
  refreshProfilePreferenceContext?: () => Promise<ProfilePreferenceAuthority>;
  artifactIdByCandidate: Map<string, string>;
  currentUserMessage: { timestamp: number | undefined; text?: string };
  compaction?: CompactionDependencies;
  activeEdit?: {
    artifactId: string;
    base: ResumeWorkspace;
    summary: string;
  };
}
