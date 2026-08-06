import { performance } from "node:perf_hooks";

import type { CooltoAgent } from "../../agent/coolto-agent.js";
import { wrapInternalPrompt } from "../../agent/internal-prompt.js";
import { instructionFor } from "../../resume/workspace/diagnostics-projection.js";
import type { ResumeCompiler } from "../../resume/workspace/compiler-port.js";
import { trySectionFill } from "../../resume/workspace/section-fill.js";
import type { ResumeWorkspace } from "../../resume/workspace/types.js";
import type { ResumeWorkspaceStatus } from "../../resume/workspace/types.js";
import type { ResumeWorkspaceStore } from "../../resume/workspace/workspace-store.js";
import { deriveWorkspaceStatus } from "../../resume/workspace/workspace-status.js";

export interface ContinuationBudget {
  /** Remaining wall-clock budget from the caller-provided start (defaults to loop start). */
  maxMs: number;
  maxModelCalls: number;
  /** Monotonic start timestamp of the whole generation command. */
  startedAtMs?: number;
}

export const DEFAULT_CONTINUATION_BUDGET: ContinuationBudget = {
  // 240s performance gate minus ~10s margin for save/approval steps.
  maxMs: 230_000,
  maxModelCalls: 30,
};

export interface HostFillSummary {
  itemId: string;
  bulletText: string;
}

export interface ContinuationCallbacks {
  log?: (line: string) => void | Promise<void>;
  onHostFill?: (fills: HostFillSummary[]) => void | Promise<void>;
}

/**
 * Statuses that still need the model to keep editing. ready_for_approval and
 * needs_user_decision are terminal by contract.
 */
export function isContinuable(status: ResumeWorkspaceStatus): boolean {
  return status === "writing" || status === "needs_revision";
}

/**
 * Host-side continuation loop. While the workspace is still
 * writing/needs_revision and the budget allows, the host first fills missing
 * planned bullets deterministically from unused evidence (visible as a host
 * tool activity), then re-prompts the agent with the same deterministic
 * diagnostics. Bounded by elapsed time and total model calls, so a stuck
 * model can never loop forever.
 */
export async function continueUntilTerminal(
  agent: Pick<CooltoAgent, "prompt" | "modelCallCount">,
  store: Pick<ResumeWorkspaceStore, "latest" | "replace">,
  compiler: ResumeCompiler,
  budget: ContinuationBudget = DEFAULT_CONTINUATION_BUDGET,
  callbacks: ContinuationCallbacks = {},
): Promise<void> {
  const startedAt = budget.startedAtMs ?? performance.now();
  for (let round = 0; round < 200; round += 1) {
    const workspace = store.latest();
    if (!workspace || !isContinuable(workspace.status)) {
      await callbacks.log?.(`continuation:stop:${workspace?.status ?? "none"}`);
      return;
    }
    if (agent.modelCallCount >= budget.maxModelCalls) {
      await callbacks.log?.(`continuation:calls:${agent.modelCallCount}`);
      normalizeToUserDecision(store);
      return;
    }
    if (performance.now() - startedAt >= budget.maxMs) {
      await callbacks.log?.("continuation:time");
      normalizeToUserDecision(store);
      return;
    }
    const filled = await trySectionFill(
      compiler,
      workspace.sourceSnapshot,
      workspace.structure,
      workspace.bindings,
      workspace.compileResult,
    );
    if (filled.applied) {
      await callbacks.onHostFill?.(filled.fills);
      await callbacks.log?.(`continuation:hostFill:${filled.fills.length}`);
      const nextRevision = workspace.revision + 1;
      store.replace(
        {
          ...workspace,
          revision: nextRevision,
          status: deriveWorkspaceStatus(
            filled.compileResult,
            filled.structure,
          ),
          structure: filled.structure,
          bindings: filled.bindings,
          compileResult: filled.compileResult,
          lastOperationReport: {
            repairs: filled.fills.map((fill) => ({
              kind: "section_fill" as const,
              action: "added" as const,
              bulletId: fill.itemId,
              evidenceIds: [fill.evidenceId],
            })),
            rejected: [],
          },
        },
        workspace.revision,
      );
    }
    const latest = store.latest();
    if (!latest || !isContinuable(latest.status)) {
      await callbacks.log?.(`continuation:stop:${latest?.status ?? "none"}`);
      return;
    }
    await callbacks.log?.(`continuation:round:${agent.modelCallCount}`);
    await agent.prompt(wrapInternalPrompt(instructionFor(latest)));
  }
  await callbacks.log?.("continuation:rounds");
}

/**
 * When the generation budget is exhausted without reaching a terminal state,
 * the workspace is normalized to needs_user_decision so the model explains the
 * evidence gap to the user instead of silently stopping on a half-finished
 * draft. The revision stays unchanged (content is untouched).
 */
function normalizeToUserDecision(
  store: Pick<ResumeWorkspaceStore, "latest" | "replace">,
): void {
  const workspace = store.latest();
  if (!workspace || !isContinuable(workspace.status)) return;
  store.replace(
    {
      ...workspace,
      status: "needs_user_decision",
      structure: {
        ...workspace.structure,
        quality_status: "needs_user_decision",
      },
    },
    workspace.revision,
  );
}
