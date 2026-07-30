export function strictRecord(
  value: unknown,
  allowed: readonly string[],
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} 无效`);
  }
  const record = value as Record<string, unknown>;
  const unknown = Object.keys(record).find((key) => !allowed.includes(key));
  if (unknown) throw new Error(`${label} 包含未知字段：${unknown}`);
  return record;
}

export function requiredId(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} 不能为空`);
  return value.trim();
}

export function childRequest<T>(value: unknown, valueFields: readonly string[]): {
  applicationId?: string | undefined;
  id?: string | undefined;
  value: T;
} {
  const outer = strictRecord(value, ["applicationId", "id", "value"], "Tracker 请求");
  const inner = strictRecord(outer.value, valueFields, "Tracker 内容") as T;
  return {
    applicationId: outer.applicationId === undefined
      ? undefined : requiredId(outer.applicationId, "applicationId"),
    id: outer.id === undefined ? undefined : requiredId(outer.id, "id"),
    value: inner,
  };
}

export function recoveryRequest(value: unknown): {
  entityType: "application" | "interview_round" | "application_note" | "reminder";
  entityId: string;
  action: "accept_server" | "reapply";
} {
  const input = strictRecord(value, ["entityType", "entityId", "action"], "同步恢复请求");
  const entityType = String(input.entityType ?? "");
  const action = String(input.action ?? "");
  if (!["application", "interview_round", "application_note", "reminder"].includes(entityType)) {
    throw new Error("同步实体类型无效");
  }
  if (action !== "accept_server" && action !== "reapply") throw new Error("同步恢复操作无效");
  return {
    entityType: entityType as "application" | "interview_round" | "application_note" | "reminder",
    entityId: requiredId(input.entityId, "entityId"), action,
  };
}
