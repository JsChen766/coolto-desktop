import {
  Agent,
  type AgentEvent,
  type AgentTool,
  type StreamFn,
} from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";

import {
  type CooltoAgentEvent,
  mapPiEvent,
} from "./events.js";

export interface CooltoAgentOptions {
  model: Model<Api>;
  streamFn: StreamFn;
  systemPrompt: string;
  tools: AgentTool[];
  getApiKey?: (provider: string) => string | undefined;
}

export type CooltoAgentListener = (
  event: CooltoAgentEvent,
  signal: AbortSignal,
) => void | Promise<void>;

export class CooltoAgent {
  readonly #agent: Agent;

  public constructor(options: CooltoAgentOptions) {
    this.#agent = new Agent({
      initialState: {
        systemPrompt: options.systemPrompt,
        model: options.model,
        tools: options.tools,
        thinkingLevel: "off",
      },
      streamFn: options.streamFn,
      toolExecution: "sequential",
      ...(options.getApiKey ? { getApiKey: options.getApiKey } : {}),
    });
  }

  public get isRunning(): boolean {
    return this.#agent.state.isStreaming;
  }

  public get toolNames(): string[] {
    return this.#agent.state.tools.map((tool) => tool.name);
  }

  public prompt(input: string): Promise<void> {
    const text = input.trim();
    if (text.length === 0) {
      return Promise.resolve();
    }

    return this.#agent.prompt(text);
  }

  public cancel(): void {
    this.#agent.abort();
  }

  public reset(): void {
    this.#agent.reset();
  }

  public subscribe(listener: CooltoAgentListener): () => void {
    return this.#agent.subscribe(
      async (event: AgentEvent, signal: AbortSignal) => {
        const mapped = mapPiEvent(event);
        if (mapped) {
          await listener(mapped, signal);
        }
      },
    );
  }
}
