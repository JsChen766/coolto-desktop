import type { ResumeToolProgress } from "../../../../agent/tool-progress.js";

export function startedToolProgressLabel(
  name: string,
  args: unknown,
): string | undefined {
  switch (name) {
    case "search_jds": return "正在确认目标岗位";
    case "search_experiences": return "正在检索经历库中的相关经历";
    case "get_experience": return "正在读取经历详情与可用事实";
    case "begin_experience_material_ingestion":
      return "正在读取材料并建立分块、数字和关键产出清单";
    case "record_experience_material_chunk":
      return "正在详细整理当前材料分块并检查遗漏";
    case "create_resume_workspace": return "正在建立简历草稿并测量整页容量";
    case "pause_resume_for_material": return "正在整理需要向你补充确认的信息";
    case "apply_resume_content": return applyStartedLabel(args);
    default: return undefined;
  }
}

export function completedToolProgressLabel(
  progress: ResumeToolProgress | undefined,
): string | undefined {
  if (!progress) return undefined;
  const usage = progress.usageRatio === undefined
    ? undefined
    : `${(progress.usageRatio * 100).toFixed(1)}%`;
  switch (progress.phase) {
    case "complete":
      return `简历已通过全部生成门槛${usage ? `，页面占用率 ${usage}` : ""}`;
    case "tail_repair":
      if ((progress.repairedTailCount ?? 0) > 0) {
        return `已修复 ${progress.repairedTailCount} 条尾行` +
          `${usage ? `，页面占用率 ${usage}` : ""}` +
          `，剩余 ${progress.remainingTailCount ?? 0} 条`;
      }
      if ((progress.progressedTailCount ?? 0) > 0) {
        return `已推进 ${progress.progressedTailCount} 条尾行修订` +
          `${usage ? `，页面占用率 ${usage}` : ""}` +
          `，剩余 ${progress.remainingTailCount ?? 0} 条`;
      }
      if (!(progress.measuredTailCount ?? 0)) {
        return `${usage ? `页面占用率 ${usage}，` : ""}` +
          `正在准备下一批完整尾行改写，剩余 ${progress.remainingTailCount ?? 0} 条`;
      }
      return `已实测 ${progress.measuredTailCount ?? 0} 份尾行改写` +
        `${usage ? `，页面占用率 ${usage}` : ""}` +
        `，正在按反馈调整剩余 ${progress.remainingTailCount ?? 0} 条`;
    case "depth_repair": {
      const stacked = progress.stackedProgressCount
        ? `（${progress.stackedProgressCount} 条继续叠加）`
        : "";
      return (progress.appliedRewriteCount ?? 0) > 0
        ? `已应用 ${progress.appliedRewriteCount} 条 bullet 深度扩写${stacked}` +
          `${usage ? `，页面占用率 ${usage}` : ""}`
        : `正在修复一行 bullet${usage ? `，页面占用率 ${usage}` : ""}`;
    }
    case "filling":
      if ((progress.appliedRewriteCount ?? 0) > 0) {
        const stacked = progress.stackedProgressCount
          ? `（${progress.stackedProgressCount} 条继续叠加）`
          : "";
        return `已应用 ${progress.appliedRewriteCount} 条篇幅扩写${stacked}` +
          `${usage ? `，页面占用率 ${usage}` : ""}`;
      }
      if ((progress.measuredRewriteCount ?? 0) > 0) {
        return `已实测 ${progress.measuredRewriteCount} 条篇幅扩写，本轮没有有效增长` +
          `${usage ? `，页面占用率 ${usage}` : ""}`;
      }
      return `当前页面占用率 ${usage ?? "待测"}，正在补足到 92%`;
    case "trimming":
      return (progress.removedBulletCount ?? 0) > 0
        ? `已移除 ${progress.removedBulletCount} 条低价值 bullet 并重新排版` +
          `${usage ? `，页面占用率 ${usage}` : ""}`
        : "内容超过一页，正在执行最小删减";
    case "awaiting_material": return "现有事实不足，正在准备一个具体的补充问题";
    case "awaiting_confirmation": return "排版已完成，正在等待你确认补写内容";
    case "drafting":
      return progress.appliedItemCount
        ? `已写入 ${progress.appliedItemCount} 段经历${usage ? `，页面占用率 ${usage}` : ""}`
        : `草稿已更新${usage ? `，页面占用率 ${usage}` : ""}`;
  }
}

function applyStartedLabel(args: unknown): string {
  const value = args && typeof args === "object"
    ? args as Record<string, unknown>
    : {};
  if (Array.isArray(value.tailRewrites)) return "正在生成并实测自然的完整尾行改写";
  if (Array.isArray(value.tailGrowths)) return "正在按 CEU 长度预算批量完善尾行";
  if (Array.isArray(value.bulletRemovals)) return "正在移除一条低价值 bullet 并重新排版";
  if (Array.isArray(value.lineExpansions)) return "正在按内容结构扩写 bullet 并重新排版";
  if (Array.isArray(value.lineRewrites)) return "正在批量扩写 bullet 并重新排版";
  if (Array.isArray(value.bulletAdditions)) {
    return "正在补足页面内容并重新排版";
  }
  if (Array.isArray(value.bulletUpdates)) return "正在调整简历内容并重新排版";
  return "正在撰写简历首稿并进行真实排版";
}
