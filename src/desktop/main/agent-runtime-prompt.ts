import { performance } from "node:perf_hooks";

import type { AgentPromptInput, ConversationDetail } from "../shared/types.js";
import {
  promptWithJdReference,
  promptWithResumeReference,
} from "./agent-prompt-reference.js";
import type { ConversationAgentContext } from "./agent-runtime-context.js";
import { AgentRuntimeEvents } from "./agent-runtime-events.js";
import { ConversationStore } from "./conversation-store.js";
import {
  continueUntilTerminal,
  INITIAL_TURN_MAX_MS,
  UNLIMITED_CONTINUATION_BUDGET,
} from "./resume-continuation.js";
import { ResumeDraftService } from "./resume-drafts/resume-draft-service.js";

export interface AgentPromptExecutionInput {
  prompt: AgentPromptInput;
  context: ConversationAgentContext;
  store: ConversationStore;
  resumeDrafts: ResumeDraftService;
  events: AgentRuntimeEvents;
  commandStartedAt: number;
  isCancelled: () => boolean;
}

export async function executeAgentPrompt(
  input: AgentPromptExecutionInput,
): Promise<ConversationDetail> {
  const { prompt, context } = input;
  if (prompt.resumeReference && prompt.jdReference) {
    throw new Error("一次消息不能同时引用 JD 和 Resume");
  }
  const editBase =
    prompt.resumeReference && prompt.resumeReference.source !== "cloud"
      ? await activateReferencedDraft(
          context,
          input.resumeDrafts,
          prompt.resumeReference.artifactId,
        )
      : undefined;
  if (editBase) {
    context.activeEdit = {
      artifactId: editBase.artifactId,
      base: structuredClone(editBase.workspace),
      summary: `AI 修改：${prompt.resumeReference?.label ?? "简历内容"}`,
    };
  }
  const promptText = prompt.jdReference
    ? promptWithJdReference(prompt.text, prompt.jdReference)
    : prompt.resumeReference
      ? promptWithResumeReference(prompt.text, prompt.resumeReference)
      : prompt.text;
  const unsubscribeInitialTurn = context.agent.subscribe((event) => {
    if (
      event.type === "model.started" &&
      performance.now() - input.commandStartedAt >= INITIAL_TURN_MAX_MS
    ) {
      context.agent.cancel();
    }
  });
  await context.agent.prompt(promptText);
  unsubscribeInitialTurn();
  while (context.agent.isRunning) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (!input.isCancelled()) {
    await continueUntilTerminal(
      context.agent,
      context.workspaceStore,
      context.resumeCompiler,
      {
        ...UNLIMITED_CONTINUATION_BUDGET,
        startedAtMs: input.commandStartedAt,
      },
      {
        isCancelled: input.isCancelled,
        onHostFill: (fills) =>
          input.events.emitHostFill(
            prompt.conversationId,
            fills.map((fill) => `${fill.itemId}:${fill.bulletText.slice(0, 12)}…`),
          ),
      },
    );
  }
  const proposed = context.workspaceStore.latest();
  if (editBase && proposed && proposed.revision !== editBase.workspace.revision) {
    await input.resumeDrafts.proposeChange({
      artifactId: editBase.artifactId,
      base: editBase.workspace,
      proposed,
      summary: context.activeEdit?.summary ?? "AI 修改简历内容",
    });
  }
  return input.store.saveMessages(
    prompt.conversationId,
    context.agent.getMessages(),
  );
}

async function activateReferencedDraft(
  context: ConversationAgentContext,
  resumeDrafts: ResumeDraftService,
  artifactId: string,
) {
  const draft = await resumeDrafts.get(artifactId);
  context.workspaceStore.restore(draft.workspace);
  context.artifactIdByCandidate.set(
    draft.workspace.candidateId,
    draft.artifactId,
  );
  return draft;
}
