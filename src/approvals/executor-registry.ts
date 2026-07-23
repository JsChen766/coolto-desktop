import type {
  ApprovalExecutionResult,
  ApprovalRequest,
} from "./types.js";

export interface ActionExecutionContext {
  request: ApprovalRequest;
  payload: unknown;
  signal?: AbortSignal;
}

export interface ActionExecutor {
  execute(
    context: ActionExecutionContext,
  ): Promise<ApprovalExecutionResult>;
  reject?(context: ActionExecutionContext): void | Promise<void>;
}

export class ActionExecutorRegistry {
  readonly #executors = new Map<string, ActionExecutor>();

  public register(actionType: string, executor: ActionExecutor): void {
    if (this.#executors.has(actionType)) {
      throw new Error(`审批执行器已经注册：${actionType}`);
    }
    this.#executors.set(actionType, executor);
  }

  public get(actionType: string): ActionExecutor {
    const executor = this.#executors.get(actionType);
    if (!executor) {
      throw new Error(`未注册审批执行器：${actionType}`);
    }
    return executor;
  }
}
