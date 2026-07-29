import type { ExperienceImportResultArtifact } from "./result-artifact.js";

export interface ExperienceImportResultPresentation {
  title: string;
  summary: string;
  buttonLabel?: string;
}

export function presentExperienceImportResult(
  artifact: ExperienceImportResultArtifact,
): ExperienceImportResultPresentation {
  const savedCount = artifact.saved.length;
  const partial = savedCount > 0 && artifact.failedCount > 0;
  const summary = [`已入库 ${savedCount} 条`];
  if (artifact.failedCount) summary.push(`${artifact.failedCount} 条待重试`);
  if (artifact.skippedDuplicateCount) {
    summary.push(`${artifact.skippedDuplicateCount} 条疑似重复已跳过`);
  }
  return {
    title: savedCount === 0
      ? "经历暂未导入"
      : partial ? "经历部分导入完成" : "经历导入完成",
    summary: summary.join(" · "),
    ...(savedCount
      ? {
          buttonLabel: savedCount === 1 && !partial
            ? "查看已入库经历"
            : partial
              ? `查看已入库的 ${savedCount} 条经历`
              : `查看 ${savedCount} 条已入库经历`,
        }
      : {}),
  };
}
