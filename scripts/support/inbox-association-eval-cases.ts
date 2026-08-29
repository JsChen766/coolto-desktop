import { readFile } from "node:fs/promises";

import type {
  AgentEvidenceStore,
  AgentEvidenceV1,
} from "../../src/agent-task/evidence-types.js";
import type { InboxMessagePayloadV1 } from
  "../../src/inbox-signals/inbox-signal-types.js";
import type { ApplicationRecord } from "../../src/tracker/types.js";

export interface InboxAssociationEvalCase {
  id: string;
  provider: "outlook" | "163";
  message: Pick<
    InboxMessagePayloadV1,
    "sender" | "subject" | "receivedAt" | "bodyText"
  >;
  applications: EvalApplication[];
  expectedApplicationKey: string | null;
  expectedKind: string;
}

export interface EvalApplication {
  key: string;
  companyName: string;
  roleName: string;
  jdTitleSnapshot?: string | null;
  status?: ApplicationRecord["status"];
  appliedAt?: string | null;
  pendingConfirmation?: boolean;
  deliveryMethod?: ApplicationRecord["deliveryMethod"];
  source?: ApplicationRecord["source"];
  syncStatus?: ApplicationRecord["syncStatus"];
}

export async function loadInboxAssociationCases(
  path: string,
): Promise<InboxAssociationEvalCase[]> {
  const lines = (await readFile(path, "utf8"))
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const cases = lines.map((line, index) => parseCase(line, index + 1));
  if (new Set(cases.map((item) => item.id)).size !== cases.length) {
    throw new Error("Inbox association eval case id 必须唯一");
  }
  return cases;
}

export function applicationRecords(value: InboxAssociationEvalCase): {
  records: ApplicationRecord[];
  idByKey: Map<string, string>;
  keyById: Map<string, string>;
} {
  const idByKey = new Map<string, string>();
  const keyById = new Map<string, string>();
  const records = value.applications.map((item, index) => {
    const id = `eval-${value.id}-${index + 1}`;
    idByKey.set(item.key, id);
    keyById.set(id, item.key);
    return applicationRecord(id, item);
  });
  return { records, idByKey, keyById };
}

export function messagePayload(
  value: InboxAssociationEvalCase,
): InboxMessagePayloadV1 {
  return {
    version: 1,
    provider: value.provider === "outlook" ? "outlook" : "browser_webmail",
    connectionId: `eval:${value.provider}`,
    sourceMessageId: `eval:${value.id}`,
    internetMessageId: null,
    ...value.message,
  };
}

export class MemoryEvalEvidenceStore implements AgentEvidenceStore {
  readonly #values = new Map<string, AgentEvidenceV1>();

  public constructor(private readonly ownerId: string) {}

  public async save(
    input: Omit<AgentEvidenceV1, "version" | "id" | "ownerId">,
  ): Promise<AgentEvidenceV1> {
    const value: AgentEvidenceV1 = {
      version: 1,
      id: `eval-evidence-${this.#values.size + 1}`,
      ownerId: this.ownerId,
      ...structuredClone(input),
    };
    this.#values.set(value.id, value);
    return structuredClone(value);
  }

  public async read(id: string): Promise<AgentEvidenceV1 | undefined> {
    const value = this.#values.get(id);
    return value ? structuredClone(value) : undefined;
  }

  public async clearExpired(): Promise<number> { return 0; }
  public async clearAll(): Promise<void> { this.#values.clear(); }
}

function parseCase(line: string, lineNumber: number): InboxAssociationEvalCase {
  let value: unknown;
  try { value = JSON.parse(line); } catch {
    throw new Error(`Inbox association eval 第 ${lineNumber} 行不是合法 JSON`);
  }
  const record = object(value, `第 ${lineNumber} 行`);
  const provider = text(record.provider, "provider");
  if (provider !== "outlook" && provider !== "163") {
    throw new Error(`第 ${lineNumber} 行 provider 只允许 outlook/163`);
  }
  const message = object(record.message, "message");
  if (!Array.isArray(record.applications)) throw new Error("applications 必须是数组");
  const applications = record.applications.map((item, index) =>
    parseApplication(object(item, `applications[${index}]`)));
  if (new Set(applications.map((item) => item.key)).size !== applications.length) {
    throw new Error(`第 ${lineNumber} 行 Application key 必须唯一`);
  }
  const expected = record.expectedApplicationKey;
  if (expected !== null && (typeof expected !== "string" ||
      !applications.some((item) => item.key === expected))) {
    throw new Error(`第 ${lineNumber} 行 expectedApplicationKey 不存在`);
  }
  return {
    id: text(record.id, "id"),
    provider,
    message: {
      sender: text(message.sender, "message.sender"),
      subject: text(message.subject, "message.subject"),
      receivedAt: new Date(text(message.receivedAt, "message.receivedAt")).toISOString(),
      bodyText: text(message.bodyText, "message.bodyText"),
    },
    applications,
    expectedApplicationKey: expected,
    expectedKind: text(record.expectedKind, "expectedKind"),
  };
}

function parseApplication(value: Record<string, unknown>): EvalApplication {
  return {
    key: text(value.key, "application.key"),
    companyName: text(value.companyName, "application.companyName"),
    roleName: text(value.roleName, "application.roleName"),
    jdTitleSnapshot: nullableText(value.jdTitleSnapshot),
    status: enumValue(value.status, [
      "applied", "screening", "interviewing", "offer", "rejected", "no_response",
    ], "applied") as ApplicationRecord["status"],
    appliedAt: nullableText(value.appliedAt),
    pendingConfirmation: value.pendingConfirmation === true,
    deliveryMethod: enumValue(value.deliveryMethod,
      ["form_fill", "email_fill", "manual", "other"], "manual") as
      ApplicationRecord["deliveryMethod"],
    source: enumValue(value.source,
      ["manual", "browser", "email", "other"], "manual") as
      ApplicationRecord["source"],
    syncStatus: enumValue(value.syncStatus,
      ["clean", "pending", "conflict", "failed"], "clean") as
      ApplicationRecord["syncStatus"],
  };
}

function applicationRecord(id: string, value: EvalApplication): ApplicationRecord {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id, jdId: null, resumeId: null,
    companyName: value.companyName, roleName: value.roleName,
    jdTitleSnapshot: value.jdTitleSnapshot ?? null,
    resumeTitleSnapshot: null, resumeContentHashSnapshot: null,
    deliveryMethod: value.deliveryMethod ?? "manual", targetUrl: null,
    appliedAt: value.appliedAt ?? null, status: value.status ?? "applied",
    pendingConfirmation: value.pendingConfirmation ?? false,
    source: value.source ?? "manual", dedupeKey: null,
    companyBusiness: null, roleSummary: null, companyCulture: null,
    rejectionReason: null, entityVersion: 1, createdAt: now, updatedAt: now,
    deletedAt: null, syncStatus: value.syncStatus ?? "clean",
  };
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} 必须是 object`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} 不能为空`);
  return value.trim();
}

function nullableText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return text(value, "nullable string");
}

function enumValue(
  value: unknown,
  allowed: string[],
  fallback: string,
): string {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new Error(`非法枚举值：${String(value)}`);
  }
  return value;
}
