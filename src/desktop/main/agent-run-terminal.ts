import type {
  ConversationRunTerminal,
  ConversationRunStatus,
} from "../shared/types.js";
import type { ResumeWorkspaceStatus } from
  "../../resume/workspace/types.js";

export function createRunTerminal(input: {
  cancelled: boolean;
  workspaceStatus?: ResumeWorkspaceStatus;
  artifactId?: string;
  error?: unknown;
  now?: string;
}): ConversationRunTerminal {
  const status = runStatus(input);
  return {
    status,
    message: terminalMessage(status, input.error),
    artifactId: input.artifactId ?? null,
    canContinue: status !== "completed",
    updatedAt: input.now ?? new Date().toISOString(),
  };
}

function runStatus(input: {
  cancelled: boolean;
  workspaceStatus?: ResumeWorkspaceStatus;
  error?: unknown;
}): ConversationRunStatus {
  if (input.cancelled) return "cancelled";
  if (input.error !== undefined) return "failed";
  return input.workspaceStatus === "needs_user_decision"
    ? "needs_user_decision"
    : "completed";
}

function terminalMessage(
  status: ConversationRunStatus,
  error: unknown,
): string | null {
  if (status === "completed") return null;
  if (status === "cancelled") {
    return "任务已取消；最近一次有效草稿和进度已保留。";
  }
  if (status === "needs_user_decision") {
    return "任务正在等待你补充信息，请查看对话中的最后一个问题。";
  }
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/insufficient[_ -]?credits|余额不足|402/iu.test(message)) {
    return "Credit 余额不足，本次任务未完成。补充额度后可以继续。";
  }
  if (/停滞|重复|轮次|调用上限|operation limit|turn/iu.test(message)) {
    return "任务因连续无有效进展而停止；最近一次有效进度已保留。";
  }
  if (/网络|network|timeout|temporar|连接/iu.test(message)) {
    return "任务因网络或服务暂时不可用而中断，可以稍后继续。";
  }
  return "任务未完成；最近一次有效进度已保留，可以重试。";
}
