import type { AgentMessage } from "@earendil-works/pi-agent-core";

import type { ResumeWorkspace } from "../../resume/workspace/types.js";

/**
 * 模型输出的稳定指纹：最后一条 assistant 消息的 content 序列化，
 * 排除 toolCall id（模型每次生成都不同，与内容无关）。
 * 连续多轮指纹相同 = 模型陷入确定性重复（温度 0 下相同输入产生
 * 相同输出），由 continueUntilTerminal 的 identical-output 守卫终止。
 */
export function assistantOutputSignature(
  messages: AgentMessage[],
): string | undefined {
  const last = [...messages]
    .reverse()
    .find((message) => message.role === "assistant");
  if (!last) return undefined;
  return stableStringify(
    last.content.map((part) =>
      part.type === "toolCall"
        ? { type: "toolCall", name: part.name, arguments: part.arguments }
        : part,
    ),
  );
}

/**
 * 上一轮工具执行结果的摘要键（成败 + 工具名 + 文本前 120 字符）。
 * 相同键连续出现 = 模型在重复同一尝试；continueUntilTerminal 用它
 * 计数并在反馈里显式告知模型，打破"相同输入 → 相同输出"的不动点。
 */
export function toolOutcomeKey(messages: AgentMessage[]): string | undefined {
  const last = [...messages]
    .reverse()
    .find((message) => message.role === "toolResult");
  if (!last) return undefined;
  const text = toolResultText(last).slice(0, 120);
  return `${last.isError ? "err" : "ok"}:${last.toolName}:${text}`;
}

/**
 * 注入下一轮续写指令的工具反馈：成败、工具名、结果摘要与相同次数。
 * 显式反馈让模型知道"我上一轮做了什么、重复了几次"，温度 0 下输入
 * 每轮不同 → 输出不再确定性重复；连续相同 N 次时直接要求停止。
 */
export function toolResultFeedback(
  messages: AgentMessage[],
  sameOutcomeRounds: number,
): string {
  const last = [...messages]
    .reverse()
    .find((message) => message.role === "toolResult");
  if (!last) return "";
  const summary = toolResultText(last).slice(0, 300);
  const repeat = sameOutcomeRounds > 0 ? `（已连续 ${sameOutcomeRounds + 1} 次相同结果）` : "";
  const stop =
    sameOutcomeRounds >= 2
      ? "连续 3 次相同结果未带来进展，停止当前策略并结束（进入 needs_user_decision）。"
      : "若结果未带来进展，改变策略或停止。";
  return `上一轮工具执行 ${last.isError ? "失败" : "成功"}（${last.toolName}）${repeat}：${summary}。${stop}`;
}

function toolResultText(
  message: Extract<AgentMessage, { role: "toolResult" }>,
): string {
  return message.content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();
}

/** workspace 内容指纹（结构 + 绑定），用于 no-progress 守卫。 */
export function contentDigest(workspace: ResumeWorkspace): string {
  return `${stableStringify(workspace.structure)}\u0000${stableStringify(
    workspace.bindings,
  )}`;
}

/** 键序无关的 JSON 序列化（工具参数键顺序可能不稳定）。 */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}
