import type {
  JobRepositoryJd,
  JobRepositoryResume,
  ResumeLibrarySyncStatus,
  TrackerSyncStatus,
} from "@desktop/types";
import { localeCode, translate } from "../i18n/locale";

export function jobSubtitle(
  jd: Pick<JobRepositoryJd, "title" | "company" | "targetRole">,
): string {
  const title = jd.title.trim();
  const company = jd.company?.trim();
  const targetRole = jd.targetRole?.trim();
  return [
    company,
    targetRole && targetRole !== title ? targetRole : undefined,
  ].filter(Boolean).join(" · ");
}

export function assetSyncLabel(status: TrackerSyncStatus): string {
  if (status === "pending") return translate("等待同步");
  if (status === "conflict") return translate("同步冲突");
  return translate("已同步");
}

export function resumeSyncLabel(status: ResumeLibrarySyncStatus): string {
  return translate({
    cloud_only: "仅云端",
    local_only: "仅本机",
    synced: "已同步",
    local_changes: "有本地修改",
    cloud_changes: "云端已更新",
    conflict: "同步冲突",
  }[status]);
}

export function resumeKindLabel(resume: JobRepositoryResume): string {
  if (resume.kind === "local_only") return translate("本地草稿");
  if (resume.kind === "generic") return translate("通用简历");
  if (resume.kind === "missing_jd") return translate("目标 JD 已缺失");
  return translate("针对性简历");
}

export function shortDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString(localeCode()) : "—";
}
