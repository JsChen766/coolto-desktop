import type { OutputRepetitionReason } from "../../agent/output-repetition-guard.js";
import { resumeGenerationReadiness } from "../workspace/generation-readiness.js";
import type { ResumeWorkspace } from "../workspace/types.js";
import { resumeGenerationStrategy } from "../source-strategy.js";

export interface ResumeStrategyFallbackDecision {
  mode: "choose_resume_strategy";
  options: ["use_general_resume", "stop_application"];
  reason: string;
}

export function tailoredResumeFallbackDecision(
  workspace: ResumeWorkspace | undefined,
  reason: OutputRepetitionReason | undefined,
): ResumeStrategyFallbackDecision | undefined {
  if (
    !workspace ||
    reason !== "narrative_limit" ||
    resumeGenerationStrategy(workspace.sourceSnapshot) !== "tailored" ||
    workspace.selectionPolicy === "user_directed" ||
    resumeGenerationReadiness(workspace).ready ||
    !allWorkUnitsUsed(workspace)
  ) return undefined;
  return {
    mode: "choose_resume_strategy",
    options: ["use_general_resume", "stop_application"],
    reason:
      "现有经历暂时无法支持一份可信、与该岗位足够匹配的针对性简历",
  };
}

function allWorkUnitsUsed(workspace: ResumeWorkspace): boolean {
  const map = workspace.workUnitMap;
  if (map?.status !== "ready" || map.units.length === 0) return false;
  const used = new Set(
    (workspace.bulletProvenance ?? []).flatMap((entry) => entry.workUnitIds ?? []),
  );
  return map.units.every((unit) => used.has(unit.workUnitId));
}
