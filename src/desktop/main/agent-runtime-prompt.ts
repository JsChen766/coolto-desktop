import { performance } from "node:perf_hooks";

import type { AgentMessage } from "@earendil-works/pi-agent-core";

import type {
  AgentPromptInput,
  MessageAttachment,
} from "../shared/types.js";
import {
  promptWithJdReference,
  promptWithResumeReference,
} from "./agent-prompt-reference.js";
import type { ConversationAgentContext } from "./agent-runtime-context.js";
import { AgentRuntimeEvents } from "./agent-runtime-events.js";
import { buildAttachmentNotice } from "./conversation-attachments.js";
import {
  continueUntilTerminal,
  INITIAL_TURN_MAX_MS,
  UNLIMITED_CONTINUATION_BUDGET,
} from "./resume-continuation.js";
import { ResumeDraftService } from "./resume-drafts/resume-draft-service.js";

export interface AgentPromptExecutionInput {
  prompt: AgentPromptInput;
  context: ConversationAgentContext;
  resumeDrafts: ResumeDraftService;
  events: AgentRuntimeEvents;
  commandStartedAt: number;
  isCancelled: () => boolean;
  /** 发送该消息时会话的附件快照；最终保存时绑定到本次用户消息。 */
  pendingAttachments: MessageAttachment[];
}

export interface AgentPromptExecutionResult {
  /** 本次 prompt 结束后的完整 transcript，由调用方统一持久化。 */
  messages: AgentMessage[];
  /**
   * 本次用户消息的 timestamp，作为附件绑定锚点。必须在
   * agent.prompt 返回后、续写轮次追加内部 user 消息之前捕获，
   * 否则「最后一条 user 消息」会被内部续写提示词抢占。
   */
  attachTimestamp: number | undefined;
}

export async function executeAgentPrompt(
  input: AgentPromptExecutionInput,
): Promise<AgentPromptExecutionResult> {
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
  const attachmentNotice =
    input.pendingAttachments.length > 0
      ? buildAttachmentNotice(input.pendingAttachments)
      : "";
  const unsubscribeInitialTurn = context.agent.subscribe((event) => {
    if (
      event.type === "model.started" &&
      performance.now() - input.commandStartedAt >= INITIAL_TURN_MAX_MS
    ) {
      context.agent.cancel();
    }
  });
  await context.agent.prompt(promptText + attachmentNotice);
  unsubscribeInitialTurn();
  const attachTimestamp = lastUserMessageTimestamp(context.agent.getMessages());
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
  return {
    messages: context.agent.getMessages(),
    attachTimestamp,
  };
}

/** 返回 transcript 里最后一条 user 消息的 timestamp（无则 undefined）。 */
function lastUserMessageTimestamp(
  messages: AgentMessage[],
): number | undefined {
  return [...messages]
    .reverse()
    .find((message) => message.role === "user")?.timestamp;
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


/**
 * Runs a follow-up prompt produced by an approval decision. The agent core
 * rejects prompts while its previous run is still settling; that race is
 * benign (the follow-up is an enhancement), so skip it instead of surfacing
 * the raw error.
 */
export async function runContinuationPrompt(
  run: () => Promise<unknown>,
): Promise<void> {
  try {
    await run();
  } catch (error: unknown) {
    if (!(error instanceof Error) || !/already processing/iu.test(error.message)) {
      throw error;
    }
  }
}
