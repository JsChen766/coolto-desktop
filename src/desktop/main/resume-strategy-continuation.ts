import type { ApprovalDecision } from "../../approvals/types.js";
import type { CooltoAgent } from "../../agent/coolto-agent.js";
import { wrapInternalPrompt } from "../../agent/internal-prompt.js";
import { RESUME_STRATEGY_CHOICE_ACTION } from
  "../../resume/strategy/choice-approval.js";
import { appendControlledAssistantMessage } from "./resume-run-feedback.js";
import { runContinuationPrompt } from "./agent-runtime-prompt.js";
import type { AgentRuntimeEvents } from "./agent-runtime-events.js";

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

export function buildGeneralResumeContinuationPrompt(): string {
  return wrapInternalPrompt([
    "用户刚刚明确选择使用通用简历。停止此前针对当前 JD 的定制流程，不得继续修改失败的 targeted workspace。",
    "先调用 list_resumes；若已有 active、qualityStatus=passed、jdId=null 的通用简历，读取最新一份并用可读标题告诉用户可以使用，不创建 Application、不自动投递。",
    "若不存在合格通用简历，则完整检索 active 经历库，按成果可信度、职责所有权、复杂度、影响力、证据完整度和经历多样性选择内容，调用 create_resume_workspace，generationStrategy=general，省略 jdId。",
    "通用简历不得引用当前 JD、requirementId 或 must-have，不得创建假 JD；继续复用 WorkUnit、事实、数字、一页、页面占用率、尾行、保存和 PDF 门禁。",
  ].join("\n"));
}

export const STOP_APPLICATION_NOTICE =
  "好的，我不会继续生成或投递这个岗位。当前未达标草稿会保留在本机，但不能用于保存或投递。";

export async function continueAfterResumeStrategyChoice(input: {
  choice: ResumeStrategyChoice | undefined;
  cancelled: boolean;
  agent: CooltoAgent;
  events: AgentRuntimeEvents;
  conversationId: string;
}): Promise<void> {
  if (input.choice === "use_general_resume" && !input.cancelled) {
    await runContinuationPrompt(() =>
      input.agent.prompt(buildGeneralResumeContinuationPrompt()),
    );
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
