import type { ResumeCompileResult } from "../compiler-types.js";
import { maxReachableUsageRatio } from "./workspace-status.js";

export type CompileObservationState = "current" | "missing" | "stale";
export type ResumeTerminalKind =
  | "ready_for_approval"
  | "needs_user_decision"
  | "stopped"
  | "failed";

export interface TerminalContinuation {
  visible: true;
  continueAutomatically: false;
  text: string;
}

export function compileObservationState(
  revision: number,
  observedRevision: number | undefined,
): CompileObservationState {
  if (observedRevision === undefined) return "missing";
  return observedRevision === revision ? "current" : "stale";
}

export function hasCurrentCompileObservation(input: {
  revision: number;
  observedRevision: number | undefined;
}): boolean {
  return compileObservationState(input.revision, input.observedRevision) === "current";
}

export function maxReachableUsageRatioForRuntime(
  result: ResumeCompileResult,
  maxBulletLines: 2 | 3 = 3,
): number {
  return maxReachableUsageRatio(result, maxBulletLines);
}

export function terminalContinuationFor(kind: ResumeTerminalKind): TerminalContinuation {
  const text = {
    ready_for_approval: "当前简历已达到交付门槛，可以预览、保存和导出。",
    needs_user_decision: "当前简历还未达到交付门槛，请补充事实或选择停止。",
    stopped: "已停止追问并保留当前草稿。",
    failed: "本次简历处理未完成，已保留最近一次有效草稿。",
  }[kind];
  return { visible: true, continueAutomatically: false, text };
}
