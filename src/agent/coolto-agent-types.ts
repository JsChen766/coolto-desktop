import type {
  AgentMessage,
  AgentTool,
  BeforeToolCallContext,
  BeforeToolCallResult,
  ShouldStopAfterTurnContext,
  StreamFn,
} from "@earendil-works/pi-agent-core";
import type { Api, Model, ThinkingLevel } from "@earendil-works/pi-ai";

import type { ApprovalManager } from "../approvals/approval-manager.js";
import type { CooltoAgentEvent } from "./events.js";
import type { TurnGovernor } from "./turn-governor.js";

export interface CooltoAgentOptions {
  model: Model<Api>;
  streamFn: StreamFn;
  systemPrompt: string;
  tools: AgentTool[];
  thinkingLevel?: ThinkingLevel;
  getApiKey?: (provider: string) => string | undefined;
  beforeToolCall?: (
    context: BeforeToolCallContext,
    signal?: AbortSignal,
  ) => Promise<BeforeToolCallResult | undefined>;
  transformContext?: (
    messages: AgentMessage[],
    signal?: AbortSignal,
  ) => Promise<AgentMessage[]>;
  shouldStopAfterTurn?: (
    context: ShouldStopAfterTurnContext,
    signal?: AbortSignal,
  ) => boolean | Promise<boolean>;
  automaticFollowUp?: (promptSequence: number) => string | undefined;
  turnGovernor?: TurnGovernor;
  approvalManager?: ApprovalManager;
}

export type CooltoAgentListener = (
  event: CooltoAgentEvent,
  signal: AbortSignal,
) => void | Promise<void>;
