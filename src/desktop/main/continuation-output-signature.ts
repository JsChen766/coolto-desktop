import type { AgentMessage } from "@earendil-works/pi-agent-core";

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
