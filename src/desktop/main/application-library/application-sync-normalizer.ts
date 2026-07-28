import type { LocalEntity } from "../sync/local-sync-types.js";
import {
  APPLICATION_STATUSES,
  type ApplicationDeliveryMethod,
  type ApplicationRecord,
  type ApplicationSource,
  type ApplicationStatus,
  type ApplicationTombstone,
} from "../../../tracker/types.js";

export function toApplicationRecord(entity: LocalEntity): ApplicationRecord {
  const value = entity.payload;
  return {
    id: requiredString(value.id, "application.id"),
    jdId: nullableString(value.jdId, "application.jdId"),
    resumeId: nullableString(value.resumeId, "application.resumeId"),
    companyName: requiredString(value.companyName, "application.companyName"),
    roleName: requiredString(value.roleName, "application.roleName"),
    jdTitleSnapshot: nullableString(value.jdTitleSnapshot, "application.jdTitleSnapshot"),
    resumeTitleSnapshot: nullableString(value.resumeTitleSnapshot, "application.resumeTitleSnapshot"),
    deliveryMethod: deliveryMethod(value.deliveryMethod),
    targetUrl: nullableString(value.targetUrl, "application.targetUrl"),
    appliedAt: nullableDate(value.appliedAt, "application.appliedAt"),
    status: applicationStatus(value.status),
    pendingConfirmation: boolean(value.pendingConfirmation, "application.pendingConfirmation"),
    source: applicationSource(value.source),
    dedupeKey: nullableString(value.dedupeKey, "application.dedupeKey"),
    companyBusiness: nullableString(value.companyBusiness, "application.companyBusiness"),
    roleSummary: nullableString(value.roleSummary, "application.roleSummary"),
    companyCulture: nullableString(value.companyCulture, "application.companyCulture"),
    rejectionReason: nullableString(value.rejectionReason, "application.rejectionReason"),
    entityVersion: Math.max(1, entity.entityVersion),
    createdAt: date(value.createdAt, "application.createdAt"),
    updatedAt: date(value.updatedAt, "application.updatedAt"),
    deletedAt: entity.operation === "delete" ? entity.changedAt : null,
    syncStatus: entity.syncStatus,
  };
}

export function toApplicationTombstone(entity: LocalEntity): ApplicationTombstone {
  if (entity.operation !== "delete") throw new Error("Application 不是墓碑");
  return {
    id: entity.entityId,
    entityVersion: Math.max(1, entity.entityVersion),
    deletedAt: entity.changedAt,
    syncStatus: entity.syncStatus,
  };
}

function applicationStatus(value: unknown): ApplicationStatus {
  if (typeof value === "string" && APPLICATION_STATUSES.includes(value as ApplicationStatus)) {
    return value as ApplicationStatus;
  }
  throw new Error("Malformed application.status");
}

function deliveryMethod(value: unknown): ApplicationDeliveryMethod {
  if (["form_fill", "email_fill", "manual", "other"].includes(String(value))) {
    return value as ApplicationDeliveryMethod;
  }
  throw new Error("Malformed application.deliveryMethod");
}

function applicationSource(value: unknown): ApplicationSource {
  if (["manual", "browser", "email", "other"].includes(String(value))) {
    return value as ApplicationSource;
  }
  throw new Error("Malformed application.source");
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Malformed ${label}`);
  return value;
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new Error(`Malformed ${label}`);
  return value;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`Malformed ${label}`);
  return value;
}

function date(value: unknown, label: string): string {
  const result = requiredString(value, label);
  if (!Number.isFinite(Date.parse(result))) throw new Error(`Malformed ${label}`);
  return result;
}

function nullableDate(value: unknown, label: string): string | null {
  return value === null ? null : date(value, label);
}
