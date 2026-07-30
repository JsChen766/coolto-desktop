import { createHash } from "node:crypto";

import { createUuidV7 } from "../../../sync/uuid-v7.js";
import type { SyncEntityType } from "../../../sync/types.js";
import type { TrackerRecoveryProposal, TrackerSyncIssueSummary } from "../../../tracker/child-types.js";
import type { LocalSyncStore } from "../sync/local-sync-store.js";
import type { EnqueueMutation, SyncIssue } from "../sync/local-sync-types.js";

const TRACKER_TYPES = ["application", "interview_round", "application_note", "reminder"] as const;

export class TrackerRecoveryService {
  readonly #proposals = new Map<string, {
    proposal: TrackerRecoveryProposal;
    fingerprint: string;
  }>();
  readonly #executing = new Set<string>();
  public constructor(
    private readonly store: LocalSyncStore,
    private readonly trigger: () => void,
    private readonly initialSync: () => Promise<void>,
    private readonly syncNow: () => Promise<void>,
  ) {}

  public async list(): Promise<TrackerSyncIssueSummary[]> {
    await this.initialSync();
    return TRACKER_TYPES.flatMap((type) => this.store.listEntities(type).flatMap((entity) => {
      const issue = this.store.getSyncIssue(type, entity.entityId);
      return issue ? [summary(issue)] : [];
    }));
  }

  public async prepare(
    entityType: TrackerSyncIssueSummary["entityType"],
    entityId: string,
    action: TrackerRecoveryProposal["action"],
  ): Promise<TrackerRecoveryProposal> {
    await this.initialSync();
    const issue = this.#issue(entityType, entityId);
    if (action === "reapply" && !canReapply(issue)) throw new Error("这项修改不能安全地重新提交");
    const proposal = Object.freeze({
      id: createUuidV7(), issue: summary(issue), action, preparedAt: new Date().toISOString(),
    });
    this.#proposals.set(proposal.id, { proposal, fingerprint: fingerprint(issue) });
    return proposal;
  }

  public async execute(id: string): Promise<void> {
    const entry = this.#proposals.get(id);
    if (!entry) throw new Error("同步恢复确认不存在或已经失效");
    if (this.#executing.has(id)) throw new Error("这项同步恢复正在执行，请稍候");
    this.#executing.add(id);
    try {
      const issue = this.#issue(entry.proposal.issue.entityType, entry.proposal.issue.entityId);
      if (fingerprint(issue) !== entry.fingerprint) {
        throw new Error("同步问题已经变化，请重新检查");
      }
      if (entry.proposal.action === "accept_server") {
        this.store.acceptServer(issue.entityType, issue.entityId);
      } else {
        this.store.replaceBlocked(reapplyMutation(issue));
      }
      this.#proposals.delete(id);
      this.trigger();
    } finally {
      this.#executing.delete(id);
    }
  }

  public async retryPending(): Promise<void> {
    this.store.retryPendingNow();
    await this.syncNow();
  }

  #issue(type: SyncEntityType, id: string): SyncIssue {
    const issue = this.store.getSyncIssue(type, id);
    if (!issue || !TRACKER_TYPES.includes(type as typeof TRACKER_TYPES[number])) {
      throw new Error("同步问题不存在或已经解决");
    }
    return issue;
  }
}

function fingerprint(issue: SyncIssue): string {
  return createHash("sha256").update(JSON.stringify({
    entityType: issue.entityType, entityId: issue.entityId, status: issue.status,
    action: issue.action, serverVersion: issue.serverVersion,
    serverOperation: issue.serverOperation, localPayload: issue.localPayload,
    serverPayload: issue.serverPayload, errorCode: issue.errorCode,
  })).digest("hex");
}

function summary(issue: SyncIssue): TrackerSyncIssueSummary {
  const applicationId = issue.entityType === "application" ? issue.entityId
    : typeof issue.localPayload.applicationId === "string" ? issue.localPayload.applicationId : null;
  return {
    entityType: issue.entityType as TrackerSyncIssueSummary["entityType"],
    entityId: issue.entityId, applicationId, status: issue.status, errorCode: issue.errorCode,
    serverDeleted: issue.serverOperation === "delete", canReapply: canReapply(issue),
  };
}

function canReapply(issue: SyncIssue): boolean {
  if (issue.serverOperation !== "upsert") return false;
  return issue.action !== "transition" && issue.action !== "create";
}

function reapplyMutation(issue: SyncIssue): EnqueueMutation {
  const now = new Date().toISOString();
  const action = issue.action;
  if (action === "transition") throw new Error("状态迁移冲突必须先接受服务端状态，再重新选择迁移");
  return {
    operationId: createUuidV7(), entityType: issue.entityType, entityId: issue.entityId,
    action, expectedVersion: action === "create" ? null : issue.serverVersion,
    payload: action === "delete" ? {} : writePayload(issue.entityType, issue.localPayload),
    localPayload: { ...issue.localPayload, updatedAt: now }, createdAt: now,
  };
}

function writePayload(type: SyncEntityType, value: Record<string, unknown>): Record<string, unknown> {
  const keys = type === "application"
    ? ["jdId", "resumeId", "companyName", "roleName", "deliveryMethod", "targetUrl", "appliedAt",
        "pendingConfirmation", "companyBusiness", "roleSummary", "companyCulture", "rejectionReason",
        "resumeContentHashSnapshot"]
    : type === "interview_round"
      ? ["applicationId", "roundNumber", "interviewType", "scheduledAt", "timezone", "durationMinutes",
          "locationOrLink", "interviewer", "status"]
      : type === "application_note"
        ? ["applicationId", "interviewRoundId", "noteType", "content"]
        : ["applicationId", "interviewRoundId", "title", "remindAt", "status", "deliveredAt"];
  return Object.fromEntries(keys.map((key) => [key, value[key]]));
}
