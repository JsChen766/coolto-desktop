import type { AgentEvent } from "@earendil-works/pi-agent-core";
import type { ApprovalEvent } from "../approvals/types.js";

export type CooltoAgentEvent =
  | { type: "run.started" }
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
    }
  | { type: "run.failed"; message: string }
  | { type: "run.completed" }
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
      return undefined;

    case "tool_execution_start":
      return {
        type: "tool.started",
        callId: event.toolCallId,
        name: event.toolName,
        arguments: event.args,
      };

    case "tool_execution_end":
      return {
        type: "tool.completed",
        callId: event.toolCallId,
        name: event.toolName,
        isError: event.isError,
      };

    case "agent_end":
      return { type: "run.completed" };

    default:
      return undefined;
  }
}
