export const OUTPUT_REPETITION_ERROR =
  "检测到模型输出停滞或重复，本次生成未完成；已保留最近一次有效草稿，请重试";
export const TURN_GOVERNOR_ERROR =
  "检测到 Agent 连续重复调用同一工具且没有完成任务，本次生成未完成；已保留最近一次有效草稿";
export const MODEL_TRANSIENT_ERROR =
  "模型连接暂时中断，自动重试后仍未恢复；已保留最近一次有效草稿";

export function isTransientModelError(message: string | undefined): boolean {
  return Boolean(
    message &&
    /terminated|connection (?:lost|error)|socket hang up|timed? out|timeout/iu.test(message),
  );
}
