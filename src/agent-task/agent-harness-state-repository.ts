import {
  emptyAgentHarnessState,
  type AgentHarnessStateV1,
} from "./agent-harness-state.js";
import { pruneAgentHarnessState } from "./agent-harness-retention.js";

export interface AgentHarnessStatePersistence {
  load(): Promise<AgentHarnessStateV1 | undefined>;
  save(state: AgentHarnessStateV1): Promise<void>;
  clear(): Promise<void>;
}

export class AgentHarnessStateRepository {
  #state: AgentHarnessStateV1 | undefined;
  #updates: Promise<void> = Promise.resolve();

  public constructor(
    private readonly ownerId: string,
    private readonly persistence: AgentHarnessStatePersistence,
  ) {}

  public async read<T>(select: (state: AgentHarnessStateV1) => T): Promise<T> {
    await this.#initialize();
    return structuredClone(select(this.#state!));
  }

  public update<T>(
    mutate: (state: AgentHarnessStateV1) => T,
  ): Promise<T> {
    const operation = this.#updates.then(async () => {
      await this.#initialize();
      const next = structuredClone(this.#state!);
      const result = mutate(next);
      pruneAgentHarnessState(next);
      next.updatedAt = new Date().toISOString();
      await this.persistence.save(next);
      this.#state = next;
      return structuredClone(result);
    });
    this.#updates = operation.then(() => undefined, () => undefined);
    return operation;
  }

  public async clear(): Promise<void> {
    await this.#updates;
    await this.persistence.clear();
    this.#state = emptyAgentHarnessState(this.ownerId);
  }

  async #initialize(): Promise<void> {
    if (this.#state) return;
    const loaded = await this.persistence.load();
    if (loaded && (loaded.version !== 1 || loaded.ownerId !== this.ownerId)) {
      throw new Error("Agent Harness 本地状态版本或 owner 不匹配");
    }
    this.#state = loaded ?? emptyAgentHarnessState(this.ownerId);
    pruneAgentHarnessState(this.#state);
  }
}

export class MemoryAgentHarnessStatePersistence
implements AgentHarnessStatePersistence {
  #state: AgentHarnessStateV1 | undefined;

  public async load(): Promise<AgentHarnessStateV1 | undefined> {
    return this.#state ? structuredClone(this.#state) : undefined;
  }

  public async save(state: AgentHarnessStateV1): Promise<void> {
    this.#state = structuredClone(state);
  }

  public async clear(): Promise<void> {
    this.#state = undefined;
  }
}
