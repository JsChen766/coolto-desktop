import { createHash } from "node:crypto";

import type {
  ExperienceCreateInput,
  ExperienceDetail,
  ExperienceUpdateInput,
} from "../../../api/types.js";
import type {
  ExperienceProposalSnapshot,
  ExperienceSyncIssueView,
} from "../../../experience/maintenance-types.js";
import { createUuidV7 } from "../../../sync/uuid-v7.js";
import type {
  EnqueueMutation,
  LocalEntity,
  SyncIssue,
} from "../sync/local-sync-types.js";
import { toExperienceDetail } from "./experience-sync-mapping.js";

export function proposalSnapshot(
  detail: ExperienceDetail,
): ExperienceProposalSnapshot {
  const revision = detail.currentRevision;
  if (!revision || !detail.currentRevisionId) throw new Error("经历缺少当前正文版本");
  return {
    id: detail.id,
    category: detail.category,
    title: detail.title,
    content: revision.content,
    organization: detail.organization,
    role: detail.role,
    location: detail.location,
    startDate: detail.startDate,
    endDate: detail.endDate,
    tags: [...detail.tags],
    resumeSectionKey: detail.resumeSectionKey ?? null,
    resumeSectionLabel: detail.resumeSectionLabel ?? null,
    status: detail.status,
    revisionId: revision.id,
    revisionHash: revision.revisionHash ?? hash(revision.content),
  };
}

export function issueView(
  issue: SyncIssue,
  localEntity: LocalEntity,
): ExperienceSyncIssueView {
  const local = toExperienceDetail(localEntity);
  const server = issue.serverOperation === "upsert" && issue.serverPayload
    ? toExperienceDetail(serverLocalEntity(issue))
    : null;
  return {
    experienceId: issue.entityId,
    status: issue.status,
    action: issue.action,
    errorCode: issue.errorCode,
    serverVersion: issue.serverVersion,
    serverDeleted: issue.serverOperation === "delete",
    local,
    server,
  };
}

export function serverLocalEntity(issue: SyncIssue): LocalEntity {
  return {
    entityType: "experience",
    entityId: issue.entityId,
    entityVersion: issue.serverVersion,
    localVersion: 1,
    syncStatus: "clean",
    operation: issue.serverOperation ?? "upsert",
    changedAt: new Date().toISOString(),
    payload: issue.serverPayload ?? {},
    lastServerOperation: issue.serverOperation,
    lastServerPayload: issue.serverPayload,
    lastErrorCode: null,
  };
}

export function changesFrom(detail: ExperienceDetail): ExperienceUpdateInput {
  return {
    category: detail.category,
    title: detail.title,
    content: detail.currentRevision?.content ?? "",
    organization: detail.organization,
    role: detail.role,
    location: detail.location,
    startDate: detail.startDate,
    endDate: detail.endDate,
    tags: [...detail.tags],
    resumeSectionKey: detail.resumeSectionKey ?? null,
    resumeSectionLabel: detail.resumeSectionLabel ?? null,
    status: detail.status,
  };
}

export function createInput(detail: ExperienceDetail): ExperienceCreateInput {
  return {
    category: detail.category,
    title: detail.title,
    content: detail.currentRevision?.content ?? "",
    ...(detail.organization !== null ? { organization: detail.organization } : {}),
    ...(detail.role !== null ? { role: detail.role } : {}),
    ...(detail.location !== null ? { location: detail.location } : {}),
    ...(detail.startDate !== null ? { startDate: detail.startDate } : {}),
    ...(detail.endDate !== null ? { endDate: detail.endDate } : {}),
    tags: [...detail.tags],
    ...(detail.resumeSectionKey ? { resumeSectionKey: detail.resumeSectionKey } : {}),
    ...(detail.resumeSectionLabel ? { resumeSectionLabel: detail.resumeSectionLabel } : {}),
    status: detail.status,
  };
}

export function updateMutation(
  id: string,
  expectedVersion: number,
  mapped: {
    writePayload: Record<string, unknown>;
    localPayload: Record<string, unknown>;
  },
  now: string,
): EnqueueMutation {
  return {
    operationId: createUuidV7(),
    entityType: "experience",
    entityId: id,
    action: "update",
    expectedVersion,
    payload: mapped.writePayload,
    localPayload: mapped.localPayload,
    createdAt: now,
  };
}

function hash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
