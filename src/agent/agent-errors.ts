import type { TurnGovernorStopReason } from "./turn-governor.js";

export const OUTPUT_REPETITION_ERROR =
  "检测到模型输出停滞或重复，本次生成未完成；已保留最近一次有效草稿，请重试";
export const OUTPUT_REPEATED_CYCLE_ERROR =
  "检测到模型输出停滞或重复（可见内容连续循环），本次生成未完成；已保留最近一次有效草稿，请重试";
export const OUTPUT_NARRATIVE_LIMIT_ERROR =
  "检测到模型输出停滞或重复（可见说明超过 8000 字），本次生成未完成；已保留最近一次有效草稿，请重试";
export const TURN_GOVERNOR_ERROR =
  "检测到 Agent 连续重复调用同一工具且没有完成任务，本次生成未完成；已保留最近一次有效草稿";
export const MODEL_TRANSIENT_ERROR =
  "模型连接暂时中断，自动重试后仍未恢复；已保留最近一次有效草稿";

export function turnGovernorError(reason: TurnGovernorStopReason): string {
  const preserved = "本次任务未完成；已保留最近一次有效草稿";
  switch (reason) {
    case "same_tool_outcome":
      return `连续操作返回了相同结果，自动处理已停止；${preserved}`;
    case "same_tool_sequence":
      return `连续操作没有产生新的正式内容或版面进展，自动处理已停止；${preserved}`;
    case "repeated_tool_errors":
      return `连续工具调用失败，自动处理已停止；${preserved}`;
    case "maximum_turns":
    case "maximum_phase_turns":
    case "maximum_total_turns":
      return `自动处理已达到轮次上限；${preserved}`;
    case "terminal_model_failure":
      return `模型执行被中断，自动处理无法继续；${preserved}`;
  }
}

export function isTransientModelError(message: string | undefined): boolean {
  return Boolean(
    message &&
    /terminated|connection (?:lost|error)|socket hang up|timed? out|timeout/iu.test(message),
  );
}

export function outputRepetitionError(
  reason: "repeated_cycle" | "narrative_limit" | undefined,
): string {
  if (reason === "repeated_cycle") return OUTPUT_REPEATED_CYCLE_ERROR;
  if (reason === "narrative_limit") return OUTPUT_NARRATIVE_LIMIT_ERROR;
  return OUTPUT_REPETITION_ERROR;
}
