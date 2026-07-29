import type {
  JobRepositoryResume,
  ResumeLibrarySyncStatus,
  TrackerSyncStatus,
} from "@desktop/types";

export function assetSyncLabel(status: TrackerSyncStatus): string {
  if (status === "pending") return "等待同步";
  if (status === "conflict") return "同步冲突";
  return "已同步";
}

export function resumeSyncLabel(status: ResumeLibrarySyncStatus): string {
  return {
    cloud_only: "仅云端",
    local_only: "仅本机",
    synced: "已同步",
    local_changes: "有本地修改",
    cloud_changes: "云端已更新",
    conflict: "同步冲突",
  }[status];
}

export function resumeKindLabel(resume: JobRepositoryResume): string {
  if (resume.kind === "local_only") return "本地草稿";
  if (resume.kind === "generic") return "通用简历";
  if (resume.kind === "missing_jd") return "目标 JD 已缺失";
  return "针对性简历";
}

export function shortDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString("zh-CN") : "—";
}
