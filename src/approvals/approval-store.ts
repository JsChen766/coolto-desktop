import { createHash, randomUUID } from "node:crypto";

import type {
  ApprovalDraft,
  ApprovalRequest,
} from "./types.js";

export interface StoredApproval {
  request: ApprovalRequest;
  payload: unknown;
  scopeKey: string;
}

export class ApprovalStore {
  readonly #pending = new Map<string, StoredApproval>();

  public create(
    draft: ApprovalDraft,
    payload: unknown,
  ): {
    approval: StoredApproval;
    replaced?: StoredApproval;
  } {
    const clonedPayload = structuredClone(payload);
    const request: ApprovalRequest = {
      id: `approval-${randomUUID()}`,
      actionType: draft.actionType,
      risk: draft.risk,
      title: draft.title,
      description: draft.description,
      preview: structuredClone(draft.preview),
      payloadHash: hashPayload(clonedPayload),
      createdAt: new Date().toISOString(),
    };
    const replaced = this.findByScope(draft.scopeKey);
    if (replaced) {
      this.#pending.delete(replaced.request.id);
    }
    const approval = {
      request,
      payload: clonedPayload,
      scopeKey: draft.scopeKey,
    };
    this.#pending.set(request.id, approval);
    return {
      approval: cloneStored(approval),
      ...(replaced ? { replaced: cloneStored(replaced) } : {}),
    };
  }

  public list(): ApprovalRequest[] {
    return [...this.#pending.values()].map(({ request }) =>
      structuredClone(request),
    );
  }

  public get(requestId: string): StoredApproval {
    const approval = this.#pending.get(requestId);
    if (!approval) {
      throw new Error("待决策操作不存在、已失效或已处理");
    }
    return cloneStored(approval);
  }

  public take(requestId: string): StoredApproval {
    const approval = this.get(requestId);
    this.#pending.delete(requestId);
    return approval;
  }

  private findByScope(scopeKey: string): StoredApproval | undefined {
    return [...this.#pending.values()].find(
      (approval) => approval.scopeKey === scopeKey,
    );
  }
}

function hashPayload(payload: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(payload) ?? "null")
    .digest("hex");
}

function cloneStored(approval: StoredApproval): StoredApproval {
  return structuredClone(approval);
}
