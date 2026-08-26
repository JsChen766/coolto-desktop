import type { BrowserAgentControlState } from "../../shared/types.js";

export type BrowserAgentCommand = "pause" | "resume" | "takeover" | "stop";
export type BrowserAgentCommandHandler = (
  command: BrowserAgentCommand,
  taskId: string,
) => void | Promise<void>;

export class BrowserAgentStatusBridge {
  #state: BrowserAgentControlState | null = null;
  #handler: BrowserAgentCommandHandler | undefined;

  public constructor(private readonly changed: () => void = () => undefined) {}

  public get(): BrowserAgentControlState | null {
    return this.#state ? structuredClone(this.#state) : null;
  }

  public set(state: BrowserAgentControlState | null): void {
    this.#state = state ? structuredClone(state) : null;
    this.changed();
  }

  public onCommand(handler: BrowserAgentCommandHandler): void {
    this.#handler = handler;
  }

  public async command(command: BrowserAgentCommand): Promise<void> {
    const taskId = this.#state?.taskId;
    if (!taskId || !this.#handler) return;
    await this.#handler(command, taskId);
  }
}
