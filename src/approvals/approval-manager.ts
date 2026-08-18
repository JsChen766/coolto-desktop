import {
  ActionExecutorRegistry,
  type ActionExecutionContext,
} from "./executor-registry.js";
import { ApprovalStore } from "./approval-store.js";
import type {
  ApprovalDecision,
  ApprovalDraft,
  ApprovalEvent,
  ApprovalRequest,
} from "./types.js";

export type ApprovalListener = (
  event: ApprovalEvent,
) => void | Promise<void>;

export class ApprovalManager {
  readonly #listeners = new Set<ApprovalListener>();

  public constructor(
    private readonly store: ApprovalStore,
    private readonly executors: ActionExecutorRegistry,
  ) {}

  public async request(
    draft: ApprovalDraft,
    payload: unknown,
  ): Promise<ApprovalRequest> {
    const { approval, replaced } = this.store.create(draft, payload);
    if (replaced) {
      await this.executors.get(replaced.request.actionType).reject?.({
        request: replaced.request,
        payload: replaced.payload,
      });
      await this.emit({
        type: "approval.resolved",
        requestId: replaced.request.id,
        decision: "replaced",
      });
    }
    await this.emit({
      type: "approval.required",
      request: approval.request,
    });
    return approval.request;
  }

  public listPending(): ApprovalRequest[] {
    return this.store.list();
  }

  /** Clears obsolete previews without executing or rejecting their payload. */
  public async dismissByActionType(actionType: string): Promise<void> {
    const requests = this.store
      .list()
      .filter((request) => request.actionType === actionType);
    for (const request of requests) {
      this.store.take(request.id);
      await this.emit({
        type: "approval.resolved",
        requestId: request.id,
        decision: "replaced",
      });
    }
  }

  public async resolve(
    requestId: string,
    decision: ApprovalDecision,
    signal?: AbortSignal,
  ): Promise<void> {
    if (decision.type === "custom" && !decision.text.trim()) {
      throw new Error("自定义回答不能为空");
    }
    const pending = this.store.get(requestId);
    const executor = this.executors.get(
      pending.request.actionType,
    );
    const approval = this.store.take(requestId);
    const context: ActionExecutionContext = {
      request: approval.request,
      payload: approval.payload,
      decision,
      ...(signal ? { signal } : {}),
    };

    await this.emit({
      type: "approval.resolved",
      requestId,
      decision: decision.type,
    });
    if (decision.type !== "accept") {
      await executor.reject?.(context);
      return;
    }

    await this.executeAccepted(context, executor);
  }

  public subscribe(listener: ApprovalListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  private async executeAccepted(
    context: ActionExecutionContext,
    executor: ReturnType<ActionExecutorRegistry["get"]>,
  ): Promise<void> {
    await this.emit({
      type: "approval.executing",
      requestId: context.request.id,
    });
    try {
      const result = await executor.execute(context);
      await this.emit({
        type: "approval.completed",
        requestId: context.request.id,
        summary: result.summary,
        ...(result.details === undefined
          ? {}
          : { details: result.details }),
      });
      if (result.nextApproval) {
        await this.request(
          result.nextApproval.draft,
          result.nextApproval.payload,
        );
      }
    } catch (error: unknown) {
      await this.emit({
        type: "approval.failed",
        requestId: context.request.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async emit(event: ApprovalEvent): Promise<void> {
    for (const listener of this.#listeners) {
      await listener(structuredClone(event));
    }
  }
}
