import { isReusableLocalDraft } from
  "../../resume/reuse/local-draft-source.js";
import { resumeGenerationStrategy } from "../../resume/source-strategy.js";
import type { ConversationAgentContext } from "./agent-runtime-context.js";
import type { AgentRuntimeEvents } from "./agent-runtime-events.js";
import type { ConversationStore } from "./conversation-store.js";
import type { ResumeDraftService } from
  "./resume-drafts/resume-draft-service.js";

export interface GeneralResumeSelection {
  artifactId: string;
  title: string;
  targetJdId: string | null;
  generationReady: boolean;
}

export async function activateBestAvailableGeneralResume(input: {
  conversationId: string;
  drafts: ResumeDraftService;
  conversations: ConversationStore;
  context: ConversationAgentContext;
  events: AgentRuntimeEvents;
}): Promise<GeneralResumeSelection> {
  const draft = (await input.drafts.listReusableDrafts())
    .filter((candidate) =>
      resumeGenerationStrategy(candidate.workspace.sourceSnapshot) === "general"
    )
    .sort((left, right) =>
      Number(isReusableLocalDraft(right)) - Number(isReusableLocalDraft(left)) ||
      right.updatedAt.localeCompare(left.updatedAt)
    )[0];
  if (!draft) {
    throw new Error("当前没有可使用的通用简历");
  }
  const targetJdId = input.context.workspaceStore.latest()
    ?.sourceSnapshot.jd?.id ?? null;
  input.context.workspaceStore.restore(draft.workspace);
  input.context.artifactIdByCandidate.set(
    draft.workspace.candidateId,
    draft.artifactId,
  );
  await input.conversations.addResumeArtifact(
    input.conversationId,
    input.drafts.artifactReference(draft),
  );
  input.events.showDraft(input.conversationId, draft.artifactId);
  return {
    artifactId: draft.artifactId,
    title: draft.title,
    targetJdId,
    generationReady: isReusableLocalDraft(draft),
  };
}
