import { resumeContentProgressKey } from "../../resume/workspace/agent-progress-key.js";
import { resumeAgentNextAction } from "../../resume/workspace/agent-next-action.js";
import { resumeGenerationReadiness } from "../../resume/workspace/generation-readiness.js";
import type { ResumeWorkspaceStore } from "../../resume/workspace/workspace-store.js";

/** Lets Pi resume once after a text-only planning turn at each measured state. */
export function createResumeGenerationFollowUp(
  store: ResumeWorkspaceStore,
): (promptSequence: number) => string | undefined {
  let lastQueuedKey: string | undefined;
  return (promptSequence) => {
    const workspace = store.latest();
    if (!workspace) return undefined;
    const action = resumeAgentNextAction(workspace);
    if (
      resumeGenerationReadiness(workspace).ready ||
      action.mode === "stop" ||
      action.mode === "request_more_material" ||
      action.mode === "stop_insufficient_material" ||
      action.mode === "await_augmented_confirmation"
    ) return undefined;
    const key = `${promptSequence}:${resumeContentProgressKey(workspace)}`;
    if (key === lastQueuedKey) return undefined;
    lastQueuedKey = key;
    return [
      "上一条回复只是未执行的中间计划，当前简历工作区仍未达到机械完成条件。",
      `最新 nextAction.mode=${action.mode}。`,
      "不要重复或展示计划；立即按最近回执的 nextAction 发起一次最合适的批量工具调用继续。",
      "如果没有任何安全的工具操作且确实缺少用户事实，则直接向用户提出一个具体问题。",
    ].join("\n");
  };
}
