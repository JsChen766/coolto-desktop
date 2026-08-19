import type { ResumeSourceSnapshot } from "../source-types.js";
import { resumeAgentNextAction } from "./agent-next-action.js";
import type { ResumeItemTier, ResumeWorkspace } from "./types.js";

/** Keeps whole-experience loss behind the bullet-level overflow fallback. */
export function overflowSourceReselectionIssue(
  workspace: ResumeWorkspace,
  next: ResumeSourceSnapshot,
  language: "zh-CN" | "en-US",
  nextItemTiers: Readonly<Record<string, ResumeItemTier>>,
): string | undefined {
  if (
    workspace.sourceSnapshot.jd.id !== next.jd.id ||
    workspace.structure.language !== language
  ) return undefined;
  const action = resumeAgentNextAction(workspace);
  if (action.mode !== "reduce_overflow") return undefined;
  const previousIds = nonEducationIds(workspace.sourceSnapshot);
  const nextIds = nonEducationIds(next);
  const removed = [...previousIds].filter((id) => !nextIds.has(id));
  const added = [...nextIds].filter((id) => !previousIds.has(id));
  const changedTier = workspace.structure.sections.some((section) =>
    section.items.some((item) =>
      Boolean(item.source_experience_id && nextIds.has(item.source_experience_id)) &&
      workspace.itemTiers?.[item.id] !== nextItemTiers[item.id]
    )
  );
  if (action.requiredInput === "bulletRemovals") {
    return removed.length || added.length || changedTier
      ? "当前仍有高于 main/secondary 最低条数的 bullet；必须先按 nextAction 使用 bulletRemovals 做一次最小删减，不得提前移除整段经历"
      : undefined;
  }
  if (added.length) {
    return "reduce_overflow 的整段经历兜底只允许移除，不得同时新增或替换经历";
  }
  if (changedTier) {
    return "reduce_overflow 的整段经历兜底不得改变保留经历的 main、secondary 或 utility 分级";
  }
  if (removed.length !== action.maximumRemovedExperiences) {
    return `reduce_overflow 每次必须且只能移除 ${action.maximumRemovedExperiences} 段非教育经历`;
  }
  return undefined;
}

function nonEducationIds(snapshot: ResumeSourceSnapshot): Set<string> {
  return new Set(snapshot.experiences.flatMap((experience) =>
    experience.category === "education" ? [] : [experience.id]
  ));
}
