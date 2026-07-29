import type {
  ExperienceDetail,
  ExperienceRevision,
} from "../api/types.js";

const SOURCE_LABELS: Record<string, string> = {
  manual: "手动编辑",
  import: "导入",
  app_generated: "应用生成",
};

export function experienceRevisionSourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? "其他来源";
}

export function mergeExperienceRevisions(
  current: readonly ExperienceRevision[],
  incoming: readonly ExperienceRevision[],
): ExperienceRevision[] {
  const merged = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) merged.set(item.id, item);
  return [...merged.values()];
}

export function canRestoreExperienceRevision(
  experience: ExperienceDetail,
  revision: ExperienceRevision,
): boolean {
  if (experience.syncStatus === "conflict" || experience.syncStatus === "failed") {
    return false;
  }
  const current = experience.currentRevision;
  if (!current) return true;
  if (current.id === revision.id || current.content === revision.content) return false;
  return !current.revisionHash
    || !revision.revisionHash
    || current.revisionHash !== revision.revisionHash;
}

export function restoreDisabledReason(
  experience: ExperienceDetail,
  revision: ExperienceRevision,
): string | undefined {
  if (experience.syncStatus === "conflict" || experience.syncStatus === "failed") {
    return "请先处理同步问题";
  }
  return canRestoreExperienceRevision(experience, revision)
    ? undefined
    : "已是当前正文";
}
