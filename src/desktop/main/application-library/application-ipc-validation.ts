import type {
  ApplicationCreateInput,
  ApplicationUpdateInput,
  ApplicationTransitionInput,
  ApplicationListOptions,
} from "../../../tracker/types.js";

const DELIVERY_METHODS = new Set(["form_fill", "email_fill", "manual", "other"]);
const SOURCES = new Set(["manual", "browser", "email", "other"]);
const STATUSES = new Set([
  "applied", "screening", "interviewing", "offer", "rejected", "no_response",
]);

const CREATE_KEYS = new Set([
  "jdId", "resumeId", "companyName", "roleName", "jdTitleSnapshot",
  "resumeTitleSnapshot", "resumeContentHashSnapshot", "deliveryMethod",
  "targetUrl", "appliedAt", "pendingConfirmation", "source", "dedupeKey",
  "companyBusiness", "roleSummary", "companyCulture", "idempotencyKey",
]);

const UPDATE_KEYS = new Set([
  "jdId", "resumeId", "resumeContentHashSnapshot", "companyName", "roleName",
  "deliveryMethod", "targetUrl", "appliedAt", "pendingConfirmation",
  "companyBusiness", "roleSummary", "companyCulture", "rejectionReason",
]);

const TRANSITION_KEYS = new Set(["toStatus", "occurredAt", "reason"]);

const LIST_KEYS = new Set(["status", "query", "jdId", "resumeId", "cursor", "limit"]);

export function parseApplicationId(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("applicationId 不能为空");
  }
  return value.trim();
}

export function parseProposalId(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("proposalId 不能为空");
  }
  return value.trim();
}

export function parseApplicationCreate(value: unknown): ApplicationCreateInput {
  const record = object(value, "投递创建请求");
  exactKeys(record, CREATE_KEYS);
  const result: ApplicationCreateInput = {
    companyName: requiredString(record.companyName, "companyName"),
    roleName: requiredString(record.roleName, "roleName"),
    deliveryMethod: enumValue(record.deliveryMethod, DELIVERY_METHODS, "deliveryMethod"),
  };
  for (const key of [
    "jdId", "resumeId", "jdTitleSnapshot", "resumeTitleSnapshot",
    "resumeContentHashSnapshot", "targetUrl", "appliedAt", "dedupeKey",
    "companyBusiness", "roleSummary", "companyCulture",
  ] as const) {
    if (record[key] !== undefined) result[key] = nullableString(record[key], key);
  }
  if (record.idempotencyKey !== undefined) {
    result.idempotencyKey = string(record.idempotencyKey, "idempotencyKey");
  }
  if (record.pendingConfirmation !== undefined) {
    result.pendingConfirmation = bool(record.pendingConfirmation, "pendingConfirmation");
  }
  if (record.source !== undefined) {
    result.source = enumValue(record.source, SOURCES, "source");
  }
  return result;
}

export function parseApplicationUpdate(value: unknown): {
  applicationId: string;
  changes: ApplicationUpdateInput;
} {
  const record = object(value, "投递更新请求");
  exactKeys(record, new Set(["applicationId", "changes"]));
  const changes = object(record.changes, "changes");
  exactKeys(changes, UPDATE_KEYS);
  const result: ApplicationUpdateInput = {
    jdId: nullableString(changes.jdId, "jdId"),
    resumeId: nullableString(changes.resumeId, "resumeId"),
    companyName: requiredString(changes.companyName, "companyName"),
    roleName: requiredString(changes.roleName, "roleName"),
    deliveryMethod: enumValue(changes.deliveryMethod, DELIVERY_METHODS, "deliveryMethod"),
    targetUrl: nullableString(changes.targetUrl, "targetUrl"),
    appliedAt: nullableString(changes.appliedAt, "appliedAt"),
    pendingConfirmation: bool(changes.pendingConfirmation, "pendingConfirmation"),
    companyBusiness: nullableString(changes.companyBusiness, "companyBusiness"),
    roleSummary: nullableString(changes.roleSummary, "roleSummary"),
    companyCulture: nullableString(changes.companyCulture, "companyCulture"),
    rejectionReason: nullableString(changes.rejectionReason, "rejectionReason"),
  };
  if (changes.resumeContentHashSnapshot !== undefined) {
    result.resumeContentHashSnapshot = nullableString(
      changes.resumeContentHashSnapshot, "resumeContentHashSnapshot",
    );
  }
  return { applicationId: parseApplicationId(record.applicationId), changes: result };
}

export function parseApplicationTransition(value: unknown): {
  applicationId: string;
  transition: ApplicationTransitionInput;
} {
  const record = object(value, "投递状态迁移请求");
  exactKeys(record, new Set(["applicationId", "transition"]));
  const transition = object(record.transition, "transition");
  exactKeys(transition, TRANSITION_KEYS);
  const result: ApplicationTransitionInput = {
    toStatus: enumValue(transition.toStatus, STATUSES, "toStatus"),
  };
  if (transition.occurredAt !== undefined) {
    result.occurredAt = nullableString(transition.occurredAt, "occurredAt");
  }
  if (transition.reason !== undefined) {
    result.reason = nullableString(transition.reason, "reason");
  }
  return { applicationId: parseApplicationId(record.applicationId), transition: result };
}

export function parseApplicationList(value: unknown): ApplicationListOptions | undefined {
  if (value === undefined) return undefined;
  const record = object(value, "投递列表参数");
  exactKeys(record, LIST_KEYS);
  const result: ApplicationListOptions = {};
  if (record.status !== undefined) {
    result.status = enumValue(record.status, STATUSES, "status");
  }
  if (record.query !== undefined) result.query = string(record.query, "query");
  if (record.jdId !== undefined) result.jdId = string(record.jdId, "jdId");
  if (record.resumeId !== undefined) result.resumeId = string(record.resumeId, "resumeId");
  if (record.cursor !== undefined) result.cursor = string(record.cursor, "cursor");
  if (record.limit !== undefined) {
    if (!Number.isSafeInteger(record.limit) || (record.limit as number) < 1) {
      throw new Error("limit 不合法");
    }
    result.limit = Math.min(record.limit as number, 500);
  }
  return result;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} 必须是对象`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(record: Record<string, unknown>, allowed: ReadonlySet<string>): void {
  const unknown = Object.keys(record).find((key) => !allowed.has(key));
  if (unknown) throw new Error(`不支持字段 ${unknown}`);
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} 必须是字符串`);
  return value;
}

function requiredString(value: unknown, label: string): string {
  const result = string(value, label).trim();
  if (!result) throw new Error(`${label} 不能为空`);
  return result;
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (value === undefined) return null;
  return string(value, label);
}

function bool(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} 必须是布尔值`);
  return value;
}

function enumValue<T extends string>(
  value: unknown,
  allowed: ReadonlySet<string>,
  label: string,
): T {
  const s = requiredString(value, label);
  if (!allowed.has(s)) throw new Error(`${label} 不合法`);
  return s as T;
}
