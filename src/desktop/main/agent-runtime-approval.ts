import type { CooltoAgent } from "../../agent/coolto-agent.js";
import type { ApprovalDecision } from "../../approvals/types.js";
import type { ConversationDetail } from "../shared/types.js";
import { buildBrowserWriteAccessContinuationPrompt, prepareBrowserWriteAccessContinuation } from "./browser-write-access-continuation.js";
import { announceResumeGenerationStart, buildJdContinuationPrompt, prepareJdContinuation } from "./jd-continuation.js";
import { AgentRuntimeEvents } from "./agent-runtime-events.js";
import { runContinuationPrompt } from "./agent-runtime-prompt.js";
import { continueAfterResumeAugmentation } from "./resume-augmentation-resolution.js";
import { createRunTerminalForContext } from "./agent-runtime-terminal.js";
import { continueAfterResumeStrategyChoice, pendingResumeStrategyChoice } from "./resume-strategy-continuation.js";
import { activateBestAvailableGeneralResume } from "./resume-strategy-general-selection.js";
import type { ConversationAgentContext } from "./agent-runtime-context.js";
import type { ConversationRunGate } from "./conversation-run-gate.js";
import type { ConversationStore } from "./conversation-store.js";
import type { ResumeDraftService } from "./resume-drafts/resume-draft-service.js";

export async function resolveAgentApproval(options: {
  conversationId: string;
  requestId: string;
  decision: ApprovalDecision;
  getContext(conversationId: string): Promise<ConversationAgentContext>;
  runGate: ConversationRunGate;
  events: AgentRuntimeEvents;
  resumeDrafts: ResumeDraftService;
  conversations: ConversationStore;
  setCancelRequested(value: boolean): void;
  isCancelRequested(): boolean;
  enqueuePersist<T>(task: () => Promise<T>): Promise<T>;
  persistSnapshot(conversationId: string, agent: CooltoAgent): Promise<void>;
}): Promise<ConversationDetail> {
  const context = await options.getContext(options.conversationId);
  await options.runGate.beginAfterCurrent(options.conversationId);
  options.setCancelRequested(false);
  let failed = false;
  try {
    const approval = context.agent.getPendingApprovals()
      .find((request) => request.id === options.requestId);
    const jdContinuation = prepareJdContinuation(
      context.agent, options.requestId, options.decision,
    );
    const writeAccessContinuation = prepareBrowserWriteAccessContinuation(
      context.agent, options.requestId, options.decision,
    );
    const resumeStrategyChoice = pendingResumeStrategyChoice(
      context.agent, options.requestId, options.decision,
    );
    if (options.decision.type === "custom") {
      context.currentUserMessage.timestamp = Date.now();
      context.currentUserMessage.text = options.decision.text;
    }
    await context.agent.resolveApproval(options.requestId, options.decision);
    await continueAfterResumeAugmentation({
      ...(approval?.actionType ? { actionType: approval.actionType } : {}),
      decision: options.decision,
      cancelled: options.isCancelRequested(),
      ...(context.workspaceStore.latest()?.candidateId
        ? { candidateId: context.workspaceStore.latest()!.candidateId } : {}),
      agent: context.agent,
      syncWorkspace: () => options.events.syncLatestWorkspace(options.conversationId, context),
    });
    const savedJd = jdContinuation?.getSavedJd();
    if (savedJd && !options.isCancelRequested()) {
      options.events.emitJdSaved(options.conversationId, options.requestId, savedJd.jdId);
      if (savedJd.resumeRequested) {
        announceResumeGenerationStart(context.agent, options.events, options.conversationId);
      }
      await runContinuationPrompt(() => context.agent.prompt(buildJdContinuationPrompt(savedJd)));
    }
    const grantedReason = writeAccessContinuation?.getGrantedReason();
    if (grantedReason && !options.isCancelRequested()) {
      await context.advanceTaskStage?.("approved_action", "user_approved_browser_access");
      await runContinuationPrompt(() => context.agent.prompt(
        buildBrowserWriteAccessContinuationPrompt(grantedReason),
      ));
    }
    await continueAfterResumeStrategyChoice({
      choice: resumeStrategyChoice,
      cancelled: options.isCancelRequested(),
      agent: context.agent,
      events: options.events,
      conversationId: options.conversationId,
      useGeneralResume: () => activateBestAvailableGeneralResume({
        conversationId: options.conversationId,
        drafts: options.resumeDrafts,
        conversations: options.conversations,
        context,
        events: options.events,
      }),
    });
    return await options.enqueuePersist(() => options.conversations.saveMessages(
      options.conversationId,
      context.agent.getMessages(),
      undefined,
      undefined,
      undefined,
      createRunTerminalForContext(context, options.isCancelRequested()),
    ));
  } catch (error) {
    failed = true;
    await options.enqueuePersist(() => options.conversations.saveRunTerminal(
      options.conversationId,
      createRunTerminalForContext(context, options.isCancelRequested(), error),
    )).catch(() => undefined);
    throw error;
  } finally {
    if (failed) await options.persistSnapshot(options.conversationId, context.agent).catch(() => {});
    options.runGate.finish(options.conversationId);
  }
}
