import { performance } from "node:perf_hooks";

import type { CooltoAgent } from "../../agent/coolto-agent.js";
import { wrapInternalPrompt } from "../../agent/internal-prompt.js";
import { instructionFor } from "../../resume/workspace/diagnostics-projection.js";
import type { ResumeCompiler } from "../../resume/workspace/compiler-port.js";
import type { ResumeWorkspace } from "../../resume/workspace/types.js";
import type { ResumeWorkspaceStatus } from "../../resume/workspace/types.js";
import type { ResumeWorkspaceStore } from "../../resume/workspace/workspace-store.js";

export interface ContinuationBudget {
  /** Remaining wall-clock budget from the caller-provided start (defaults to loop start). */
  maxMs: number;
  maxModelCalls: number;
  /** Monotonic start timestamp of the whole generation command. */
  startedAtMs?: number;
  /** Per-turn guard: a model request that hangs past this is aborted. */
  turnTimeoutMs?: number;
}

export const DEFAULT_CONTINUATION_BUDGET: ContinuationBudget = {
  // 240s performance gate minus ~10s margin for save/approval steps.
  maxMs: 230_000,
  maxModelCalls: 30,
  turnTimeoutMs: 60_000,
};

/**
 * Production budget aligned with the CLI --no-timeout mode: no wall-clock
 * hard cap (generation is state-driven and must finish), only generous
 * runaway guards remain. Time and round limits are set wide on purpose so
 * the continuation never interrupts an in-flight generation: the per-turn
 * timeout only guards against a truly dead network connection.
 */
export const UNLIMITED_CONTINUATION_BUDGET: ContinuationBudget = {
  maxMs: Number.POSITIVE_INFINITY,
  maxModelCalls: 300,
  turnTimeoutMs: 180_000,
};

/** Initial user-message turn soft cap before handing over to continuation. */
export const INITIAL_TURN_MAX_MS = 600_000;

/** Consecutive per-turn timeouts tolerated before giving up. */
export const MAX_CONSECUTIVE_TURN_TIMEOUTS = 5;

/** Consecutive rounds without a revision landing: the model is stuck
 * (repeating rejected text, empty reasoning); stop instead of burning the
 * whole budget. */
export const MAX_NO_PROGRESS_ROUNDS = 8;

export interface HostFillSummary {
  itemId: string;
  bulletText: string;
}

export interface ContinuationCallbacks {
  log?: (line: string) => void | Promise<void>;
  onHostFill?: (fills: HostFillSummary[]) => void | Promise<void>;
  /** User-initiated stop (desktop stop button): checked each round so an
   * aborted model call does not immediately restart the generation. */
  isCancelled?: () => boolean;
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
 * writing/needs_revision and the budget allows, the host re-prompts the agent
 * with the same deterministic diagnostics and lets the agent drive its own
 * layout, writing and finishing decisions (agent orchestration). No host-side
 * section filling: content decisions belong to the agent. Bounded by elapsed
 * time and total model calls, so a stuck model can never loop forever.
 */
export async function continueUntilTerminal(
  agent: Pick<CooltoAgent, "prompt" | "modelCallCount" | "cancel" | "isRunning">,
  store: Pick<ResumeWorkspaceStore, "latest" | "replace">,
  _compiler: ResumeCompiler,
  budget: ContinuationBudget = DEFAULT_CONTINUATION_BUDGET,
  callbacks: ContinuationCallbacks = {},
): Promise<void> {
  const startedAt = budget.startedAtMs ?? performance.now();
  let consecutiveTimeouts = 0;
  let lastContentKey: string | undefined;
  let noProgressRounds = 0;
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
    // User-initiated stop (desktop stop button): aborting the current model
    // call alone would leave the loop unaware and immediately re-prompt. Stop
    // without touching the workspace: the partial draft and transcript stay
    // as the user left them.
    if (callbacks.isCancelled?.()) {
      await callbacks.log?.("continuation:cancelled");
      return;
    }
    // No-progress guard: a stuck model (repeating the same rejected text,
    // empty reasoning loops) never lands a content change. The content digest
    // (structure + bindings) rather than the revision is compared because
    // idempotent no-op patches bump the revision without changing content;
    // those must still count as no progress. Detect it and stop instead of
    // burning the whole budget, especially in unlimited mode.
    const contentKey = contentDigest(workspace);
    if (contentKey === lastContentKey) {
      noProgressRounds += 1;
      if (noProgressRounds >= MAX_NO_PROGRESS_ROUNDS) {
        await callbacks.log?.(`continuation:no-progress:${noProgressRounds}`);
        normalizeToUserDecision(store);
        return;
      }
    } else {
      noProgressRounds = 0;
      lastContentKey = contentKey;
    }
    await callbacks.log?.(`continuation:round:${agent.modelCallCount}`);
    const timedOut = await promptWithTurnTimeout(
      agent,
      wrapInternalPrompt(instructionFor(store.latest()!)),
      budget.turnTimeoutMs ?? 90_000,
    );
    if (timedOut) {
      // A hung model request is transient (network/gateway); keep the run
      // alive and retry, only giving up after repeated consecutive hangs.
      consecutiveTimeouts += 1;
      await callbacks.log?.(`continuation:turn-timeout:${consecutiveTimeouts}`);
      if (consecutiveTimeouts >= MAX_CONSECUTIVE_TURN_TIMEOUTS) {
        normalizeToUserDecision(store);
        return;
      }
      continue;
    }
    consecutiveTimeouts = 0;
  }
  await callbacks.log?.("continuation:rounds");
}

/**
 * Guards one continuation turn: if the model request hangs (network stall,
 * gateway issue) past the timeout, the agent is aborted so the loop can
 * normalize the workspace instead of blocking forever.
 */
async function promptWithTurnTimeout(
  agent: Pick<CooltoAgent, "prompt" | "cancel" | "isRunning">,
  prompt: string,
  timeoutMs: number,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      agent.prompt(prompt),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("continuation turn timed out")), timeoutMs);
      }),
    ]);
    return false;
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "continuation turn timed out") {
      agent.cancel();
      // The aborted stream may still be flushing; wait until the agent is
      // idle so the next continuation prompt does not hit
      // "already processing".
      while (agent.isRunning) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return true;
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Deterministic fingerprint of the resume content a revision carries. Any
 * patch that actually changes the draft (or the agent's bindings) flips the
 * key; idempotent no-ops and timeouts do not.
 */
function contentDigest(workspace: ResumeWorkspace): string {
  return `${JSON.stringify(workspace.structure)}\u0000${JSON.stringify(
    workspace.bindings,
  )}`;
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
