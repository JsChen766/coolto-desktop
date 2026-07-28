import type { CooltoAgent } from "../../agent/coolto-agent.js";
import { JdProposalStore } from "../../jd/proposal-store.js";
import { MatchReportStore } from "../../match/report-store.js";
import { ResumeWorkspaceStore } from "../../resume/workspace/workspace-store.js";

export interface ConversationAgentContext {
  agent: CooltoAgent;
  workspaceStore: ResumeWorkspaceStore;
  jdProposalStore: JdProposalStore;
  matchReportStore: MatchReportStore;
  artifactIdByCandidate: Map<string, string>;
  activeEdit?: {
    artifactId: string;
    base: NonNullable<ReturnType<ResumeWorkspaceStore["latest"]>>;
    summary: string;
  };
}
