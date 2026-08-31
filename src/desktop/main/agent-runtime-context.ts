import type { CooltoAgent } from "../../agent/coolto-agent.js";
import type { CompactionDependencies } from "./context-compaction.js";
import { JdProposalStore } from "../../jd/proposal-store.js";
import { MatchReportStore } from "../../match/report-store.js";
import type { ResumeCompiler } from "../../resume/workspace/compiler-port.js";
import { ResumeWorkspaceStore } from "../../resume/workspace/workspace-store.js";
import type { ApprovalManager } from "../../approvals/approval-manager.js";
import type { ResumeExperienceSyncProposalPort } from
  "../../resume/material/experience-sync-port.js";

export interface ConversationAgentContext {
  agent: CooltoAgent;
  workspaceStore: ResumeWorkspaceStore;
  resumeCompiler: ResumeCompiler;
  jdProposalStore: JdProposalStore;
  matchReportStore: MatchReportStore;
  scopeTools: () => Promise<void>;
  approvalManager: ApprovalManager;
  experienceSyncProposals: ResumeExperienceSyncProposalPort;
  artifactIdByCandidate: Map<string, string>;
  /** Host-owned provenance anchor for facts added from the current user turn. */
  currentUserMessage: { timestamp: number | undefined; text?: string };
  /** Model plumbing for context compaction (summary generation). */
  compaction?: CompactionDependencies;
  activeEdit?: {
    artifactId: string;
    base: NonNullable<ReturnType<ResumeWorkspaceStore["latest"]>>;
    summary: string;
  };
}
