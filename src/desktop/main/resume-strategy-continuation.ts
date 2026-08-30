import type { ApprovalDecision } from "../../approvals/types.js";
import type { CooltoAgent } from "../../agent/coolto-agent.js";
import { RESUME_STRATEGY_CHOICE_ACTION } from
  "../../resume/strategy/choice-approval.js";
import { appendControlledAssistantMessage } from "./resume-run-feedback.js";
import type { AgentRuntimeEvents } from "./agent-runtime-events.js";
import type { GeneralResumeSelection } from
  "./resume-strategy-general-selection.js";

export type ResumeStrategyChoice = "use_general_resume" | "stop_application";

export function pendingResumeStrategyChoice(
  agent: CooltoAgent,
  requestId: string,
  decision: ApprovalDecision,
): ResumeStrategyChoice | undefined {
  const matches = agent.getPendingApprovals().some((request) =>
    request.id === requestId &&
    request.actionType === RESUME_STRATEGY_CHOICE_ACTION
  );
  if (!matches) return undefined;
  return decision.type === "accept"
    ? "use_general_resume"
    : decision.type === "reject"
      ? "stop_application"
      : undefined;
}

export const STOP_APPLICATION_NOTICE =
  "好的，我不会继续生成或投递这个岗位。本次会话结束；当前未达标草稿会保留在本机，但不能用于保存或投递。";

export async function continueAfterResumeStrategyChoice(input: {
  choice: ResumeStrategyChoice | undefined;
  cancelled: boolean;
  agent: CooltoAgent;
  events: AgentRuntimeEvents;
  conversationId: string;
  useGeneralResume(): Promise<GeneralResumeSelection>;
}): Promise<void> {
  if (input.choice === "use_general_resume" && !input.cancelled) {
    const selected = await input.useGeneralResume();
    const timestamp = Date.now();
    const notice = selected.generationReady
      ? `已切换到通用简历《${selected.title}》，现在可以用它继续准备这个岗位的投递。`
      : `已切换到通用简历《${selected.title}》。这份简历尚未达到投递门槛，我不会继续自动扩写。`;
    input.agent.replaceMessages(appendControlledAssistantMessage(
      input.agent.getMessages(), notice, timestamp,
    ));
    input.events.emitAssistantNotice(input.conversationId, notice, timestamp);
    return;
  }
  if (input.choice !== "stop_application") return;
  const timestamp = Date.now();
  input.agent.replaceMessages(appendControlledAssistantMessage(
    input.agent.getMessages(), STOP_APPLICATION_NOTICE, timestamp,
  ));
  input.events.emitAssistantNotice(
    input.conversationId,
    STOP_APPLICATION_NOTICE,
    timestamp,
  );
}
