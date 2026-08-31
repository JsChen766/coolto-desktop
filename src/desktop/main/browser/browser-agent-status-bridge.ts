import type {
  BrowserAgentChromeView,
  BrowserAgentControl,
} from "../../shared/types.js";

export type BrowserAgentCommand = "pause" | "resume" | "takeover" | "stop";
export type BrowserAgentCommandHandler = (
  command: BrowserAgentCommand,
  taskId: string,
) => void | Promise<void>;

export class BrowserAgentStatusBridge {
  #commandError: string | null = null;
  #commandPending = false;
  #conversationId: string | null = null;
  #handler: BrowserAgentCommandHandler | undefined;
  #sourceDisposer: (() => void) | undefined;
  #sourceVersion = 0;
  #state: BrowserAgentChromeView | null = null;
  #taskId: string | null = null;

  public constructor(private readonly changed: () => void = () => undefined) {}

  public get(): BrowserAgentChromeView | null {
    return this.#state ? structuredClone(this.#state) : null;
  }

  public setProjection(input: {
    conversationId: string;
    state: BrowserAgentChromeView;
    taskId: string;
  }): void {
    this.#conversationId = input.conversationId;
    this.#taskId = input.taskId;
    this.#state = structuredClone({
      ...input.state,
      commandError: this.#commandError,
      commandPending: this.#commandPending,
    });
    this.changed();
  }

  public bindSource(dispose: () => void): void {
    this.#sourceDisposer?.();
    this.#sourceDisposer = dispose;
    this.#sourceVersion += 1;
    this.#resetProjection();
  }

  public clear(): void {
    this.#sourceDisposer?.();
    this.#sourceDisposer = undefined;
    this.#sourceVersion += 1;
    this.#resetProjection();
  }

  public clearProjection(): void { this.#resetProjection(); }

  #resetProjection(): void {
    this.#commandError = null;
    this.#commandPending = false;
    this.#conversationId = null;
    this.#state = null;
    this.#taskId = null;
    this.changed();
  }

  public taskId(): string | null { return this.#taskId; }
  public conversationId(): string | null { return this.#conversationId; }
  public commandPending(): boolean { return this.#commandPending; }
  public commandError(): string | null { return this.#commandError; }
  public controlFor(taskId: string): BrowserAgentControl {
    return this.#taskId === taskId && this.#state?.control === "user" ? "user" : "agent";
  }

  public onCommand(handler: BrowserAgentCommandHandler): void {
    this.#handler = handler;
  }

  public async command(command: BrowserAgentCommand): Promise<boolean> {
    const taskId = this.#taskId;
    if (!taskId || !this.#handler || this.#commandPending || !this.#allowed(command)) {
      return false;
    }
    this.#commandPending = true;
    this.#commandError = null;
    const sourceVersion = this.#sourceVersion;
    this.#updateTransient();
    try {
      await this.#handler(command, taskId);
      return true;
    } catch (error) {
      if (sourceVersion === this.#sourceVersion && taskId === this.#taskId) {
        this.#commandError = "任务操作失败，请重试";
      }
      throw error;
    } finally {
      if (sourceVersion === this.#sourceVersion && taskId === this.#taskId) {
        this.#commandPending = false;
        this.#updateTransient();
      }
    }
  }

  #allowed(command: BrowserAgentCommand): boolean {
    const commands = this.#state?.commands;
    return Boolean(commands?.[command]);
  }

  #updateTransient(): void {
    if (this.#state) this.#state = {
      ...this.#state,
      commandError: this.#commandError,
      commandPending: this.#commandPending,
    };
    this.changed();
  }
}
