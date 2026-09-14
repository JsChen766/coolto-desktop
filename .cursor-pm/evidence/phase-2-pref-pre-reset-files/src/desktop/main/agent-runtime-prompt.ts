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
import { buildAttachmentNotice } from "./conversation-attachments.js";
import { ResumeDraftService } from "./resume-drafts/resume-draft-service.js";
import {
  appendResumeRunFeedback,
  resumeRunFeedbackState,
} from "./resume-run-feedback.js";
import { canonicalizeResumeBoundaryResponse } from
  "./resume-boundary-response.js";
import { tailoredResumeFallbackDecision } from
  "../../resume/strategy/tailored-fallback.js";
import { requestResumeStrategyChoice } from
  "../../resume/strategy/choice-approval.js";
import { replaceFailedResumeRunWithStrategyMessage } from
  "./resume-strategy-messages.js";
import {
  prepareResumeWorkspaceRecovery,
  resumeContinuationDecision,
} from "./resume-continuation.js";
import { assertResumeWorkspaceCurrent } from
  "./resume-drafts/resume-conversation-restorer.js";

const STRATEGY_FALLBACK_MESSAGE =
  "现有经历与这个岗位的匹配度太低，无法在不编造事实的前提下生成可信的针对性简历。你可以直接使用通用简历继续投递，或者不继续投递这个岗位。";

export interface AgentPromptExecutionInput {
  prompt: AgentPromptInput;
  context: ConversationAgentContext;
  resumeDrafts: ResumeDraftService;
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
  const messageStartIndex = context.agent.getMessages().length;
  // pi-agent-core owns the complete model -> tool -> model loop. A real user
  // message maps to exactly one prompt; the host never injects phase prompts
  // or re-prompts a half-finished resume workspace.
  context.currentUserMessage.timestamp = Date.now();
  context.currentUserMessage.text = prompt.text;
  await context.refreshProfilePreferenceContext?.();
  await context.agent.prompt(promptText + attachmentNotice);
  const runStopError = context.agent.runStopError;
  const proposed = context.workspaceStore.latest();
  const continuationDecision = proposed
    ? resumeContinuationDecision({ workspace: proposed })
    : undefined;
  if (runStopError && context.agent.runGuardStopReason && proposed &&
    continuationDecision?.action === "stop") {
    const terminalMessages = canonicalizeResumeBoundaryResponse(
      context.agent.getMessages(),
      proposed,
      messageStartIndex,
    );
    const messagesWithFeedback = appendResumeRunFeedback({
      messages: terminalMessages,
      userText: prompt.text,
      state: resumeRunFeedbackState(proposed),
    });
    if (editBase && proposed && proposed.revision !== editBase.workspace.revision) {
      await input.resumeDrafts.proposeChange({
        artifactId: editBase.artifactId,
        base: editBase.workspace,
        proposed,
        summary: context.activeEdit?.summary ?? "AI 修改简历内容",
      });
    }
    context.agent.replaceMessages(messagesWithFeedback);
    return {
      messages: messagesWithFeedback,
      attachTimestamp: lastUserMessageTimestamp(messagesWithFeedback),
    };
  }
  const strategyFallback = tailoredResumeFallbackDecision(
    proposed,
    context.agent.runGuardStopReason,
  );
  if (runStopError && proposed && strategyFallback) {
    await requestResumeStrategyChoice(
      context.approvalManager,
      proposed,
      strategyFallback,
    );
    const messages = replaceFailedResumeRunWithStrategyMessage(
      context.agent.getMessages(),
      STRATEGY_FALLBACK_MESSAGE,
    );
    context.agent.replaceMessages(messages);
    return {
      messages,
      attachTimestamp: lastUserMessageTimestamp(messages),
    };
  }
  if (runStopError) {
    discardFailedRunMessages(context);
    throw new Error(runStopError);
  }
  const canonicalMessages = canonicalizeResumeBoundaryResponse(
    context.agent.getMessages(),
    proposed,
    messageStartIndex,
  );
  context.agent.replaceMessages(canonicalMessages);
  if (editBase && proposed && proposed.revision !== editBase.workspace.revision) {
    await input.resumeDrafts.proposeChange({
      artifactId: editBase.artifactId,
      base: editBase.workspace,
      proposed,
      summary: context.activeEdit?.summary ?? "AI 修改简历内容",
    });
  }
  const messagesWithFeedback = appendResumeRunFeedback({
    messages: canonicalMessages,
    userText: prompt.text,
    state: resumeRunFeedbackState(proposed),
  });
  context.agent.replaceMessages(messagesWithFeedback);
  const attachTimestamp = lastUserMessageTimestamp(messagesWithFeedback);
  return {
    messages: messagesWithFeedback,
    attachTimestamp,
  };
}
function discardFailedRunMessages(
  context: ConversationAgentContext,
): void {
  const messages = context.agent.getMessages();
  const lastUserIndex = messages.findLastIndex((message) => message.role === "user");
  if (lastUserIndex >= 0) context.agent.replaceMessages(messages.slice(0, lastUserIndex + 1));
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
  await assertResumeWorkspaceCurrent(
    draft.workspace,
    resumeDrafts,
    {
      sourceBuilder: context.sourceBuilder,
      resumeReader: context.resumeReader,
      profilePreferenceContext: async () => {
        const refresh = context.refreshProfilePreferenceContext;
        if (!refresh) throw new Error("Profile/Preference context unavailable");
        const authority = await refresh();
        return {
          targetFingerprint: authority.targetFingerprint,
          profileEntityVersion: authority.profileVersion,
          preferenceResolutionHash: authority.resolutionHash,
          explainability: {
            appliedKeys: authority.resolution.applied.map((item) => item.key),
            overriddenCount: authority.resolution.overridden.length,
            conflictCount: authority.resolution.conflicts.length,
          },
        };
      },
    },
  );
  const workspace = prepareResumeWorkspaceRecovery(
    context.workspaceStore.latest(),
    draft.workspace,
  );
  context.workspaceStore.restore(workspace);
  context.artifactIdByCandidate.set(
    workspace.candidateId,
    draft.artifactId,
  );
  return { ...draft, workspace };
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
