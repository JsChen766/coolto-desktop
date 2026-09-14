export const MAX_ACTIVE_EXPERIENCES = 200;
export const MAX_ACTIVE_RESUMES = 100;

export function countLiveAssets(
  entities: readonly { operation: string; payload: Record<string, unknown> }[],
): number {
  return entities.filter((entity) =>
    entity.operation !== "delete" && entity.payload.status !== "archived"
  ).length;
}

export function assertAssetCapacity(
  kind: "experience" | "resume",
  count: number,
): void {
  const max = kind === "experience" ? MAX_ACTIVE_EXPERIENCES : MAX_ACTIVE_RESUMES;
  if (count < max) return;
  throw new Error(
    kind === "experience"
      ? `经历已达上限 ${max} 条，请先归档或删除后再新增。`
      : `云端简历已达上限 ${max} 份，请先归档后再保存新简历。`,
  );
}
