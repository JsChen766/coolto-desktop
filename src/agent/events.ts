import type { AgentEvent } from "@earendil-works/pi-agent-core";
import type { ApprovalEvent } from "../approvals/types.js";

export interface ModelCallUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  reasoning?: number;
}

export type CooltoAgentEvent =
  | { type: "run.started" }
  | { type: "model.started" }
  | { type: "model.completed"; isError: boolean; usage?: ModelCallUsage }
  | { type: "message.delta"; text: string }
  | {
      type: "tool.started";
      callId: string;
      name: string;
      arguments: unknown;
    }
  | {
      type: "tool.completed";
      callId: string;
      name: string;
      isError: boolean;
      error?: string;
    }
  | { type: "run.failed"; message: string }
  | { type: "run.completed" }
  | { type: "turn.completed" }
  | ApprovalEvent;

export function mapPiEvent(event: AgentEvent): CooltoAgentEvent | undefined {
  switch (event.type) {
    case "agent_start":
      return { type: "run.started" };

    case "message_update":
      if (event.assistantMessageEvent.type === "text_delta") {
        return {
          type: "message.delta",
          text: event.assistantMessageEvent.delta,
        };
      }
      return undefined;

    case "message_start":
      return event.message.role === "assistant"
        ? { type: "model.started" }
        : undefined;

    case "message_end":
      if (
        event.message.role === "assistant" &&
        event.message.stopReason === "error"
      ) {
        return {
          type: "run.failed",
          message: event.message.errorMessage ?? "模型调用失败",
        };
      }
      return event.message.role === "assistant"
        ? {
            type: "model.completed",
            isError: false,
            ...(event.message.usage
              ? { usage: slimModelUsage(event.message.usage) }
              : {}),
          }
        : undefined;

    case "tool_execution_start":
      return {
        type: "tool.started",
        callId: event.toolCallId,
        name: event.toolName,
        arguments: event.args,
      };

    case "tool_execution_end": {
      const errorText = event.isError ? toolErrorText(event.result) : undefined;
      return {
        type: "tool.completed",
        callId: event.toolCallId,
        name: event.toolName,
        isError: event.isError,
        ...(errorText ? { error: errorText } : {}),
      };
    }

    case "agent_end":
      return { type: "run.completed" };

    case "turn_end":
      return { type: "turn.completed" };

    default:
      return undefined;
  }
}

function slimModelUsage(usage: {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  reasoning?: number;
}): ModelCallUsage {
  return {
    input: usage.input ?? 0,
    output: usage.output ?? 0,
    cacheRead: usage.cacheRead ?? 0,
    cacheWrite: usage.cacheWrite ?? 0,
    ...(usage.reasoning !== undefined ? { reasoning: usage.reasoning } : {}),
  };
}

function toolErrorText(result: unknown): string | undefined {
  if (typeof result === "string") return result.slice(0, 300);
  if (result && typeof result === "object") {
    const content = (result as { content?: unknown }).content;
    if (Array.isArray(content)) {
      for (const item of content) {
        if (item && typeof item === "object") {
          const text = (item as { text?: unknown }).text;
          if (typeof text === "string") return text.slice(0, 300);
        }
      }
    }
    const text = (result as { text?: unknown }).text;
    if (typeof text === "string") return text.slice(0, 300);
    const message = (result as { message?: unknown }).message;
    if (typeof message === "string") return message.slice(0, 300);
  }
  return undefined;
}
