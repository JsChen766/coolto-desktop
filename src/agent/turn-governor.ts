import { createHash } from "node:crypto";

import type { ShouldStopAfterTurnContext } from "@earendil-works/pi-agent-core";

const DEFAULT_MAX_TURNS = 40;
const DEFAULT_SAME_OUTCOME_LIMIT = 3;
const DEFAULT_ERROR_OUTCOME_LIMIT = 5;
// Opted-in tools provide a progress key. Four consecutive results with the
// same key indicate state churn; productive writes change the key and reset it.
const DEFAULT_SAME_TOOL_SEQUENCE_LIMIT = 4;

export type TurnGovernorStopReason =
  | "maximum_turns"
  | "terminal_model_failure"
  | "same_tool_outcome"
  | "repeated_tool_errors"
  | "same_tool_sequence";

export interface TurnGovernorOptions {
  maxTurns?: number;
  sameOutcomeLimit?: number;
  errorOutcomeLimit?: number;
  sameToolSequenceLimit?: number;
}

export interface TurnGovernor {
  evaluate(context: ShouldStopAfterTurnContext): boolean;
  readonly stopReason: TurnGovernorStopReason | undefined;
  reset(): void;
}

/**
 * Task-agnostic guard for one Agent run. It observes completed model/tool
 * turns, but never selects tools or interprets product intent.
 */
export function createTurnGovernor(
  options: TurnGovernorOptions = {},
): TurnGovernor {
  const maxTurns = options.maxTurns ?? DEFAULT_MAX_TURNS;
  const sameOutcomeLimit =
    options.sameOutcomeLimit ?? DEFAULT_SAME_OUTCOME_LIMIT;
  const errorOutcomeLimit =
    options.errorOutcomeLimit ?? DEFAULT_ERROR_OUTCOME_LIMIT;
  const sameToolSequenceLimit =
    options.sameToolSequenceLimit ?? DEFAULT_SAME_TOOL_SEQUENCE_LIMIT;
  let runMarker: string | undefined;
  let turns = 0;
  let lastOutcome: string | undefined;
  let sameOutcomeRounds = 0;
  let errorOutcomeRounds = 0;
  let lastToolSequence: string | undefined;
  let sameToolSequenceRounds = 0;
  let stopReason: TurnGovernorStopReason | undefined;

  const reset = (): void => {
    turns = 0;
    lastOutcome = undefined;
    sameOutcomeRounds = 0;
    errorOutcomeRounds = 0;
    lastToolSequence = undefined;
    sameToolSequenceRounds = 0;
    stopReason = undefined;
  };
  const evaluate = (context: ShouldStopAfterTurnContext): boolean => {
    const currentRunMarker = signature(context.newMessages[0]);
    if (currentRunMarker !== runMarker) {
      runMarker = currentRunMarker;
      reset();
    }
    turns += 1;
    if (turns >= maxTurns) return stop("maximum_turns");
    if (isTerminalModelFailure(context.message)) {
      return stop("terminal_model_failure");
    }
    if (context.toolResults.length === 0) return false;

    const outcome = outcomeSignature(context.toolResults);
    sameOutcomeRounds = outcome === lastOutcome ? sameOutcomeRounds + 1 : 1;
    lastOutcome = outcome;
    errorOutcomeRounds = context.toolResults.every((result) => result.isError)
      ? errorOutcomeRounds + 1
      : 0;
    const toolSequence = loopGuardSequence(context.toolResults);
    sameToolSequenceRounds = toolSequence && toolSequence === lastToolSequence
      ? sameToolSequenceRounds + 1
      : toolSequence ? 1 : 0;
    lastToolSequence = toolSequence;
    if (sameOutcomeRounds >= sameOutcomeLimit) return stop("same_tool_outcome");
    if (errorOutcomeRounds >= errorOutcomeLimit) return stop("repeated_tool_errors");
    if (sameToolSequenceRounds >= sameToolSequenceLimit) {
      return stop("same_tool_sequence");
    }
    return false;
  };
  const stop = (reason: TurnGovernorStopReason): true => {
    stopReason = reason;
    return true;
  };
  return {
    evaluate,
    get stopReason() {
      return stopReason;
    },
    reset,
  };
}

function loopGuardSequence(
  results: ShouldStopAfterTurnContext["toolResults"],
): string | undefined {
  const keys = results.map((result) => {
    const details = result.details;
    if (!details || typeof details !== "object") return undefined;
    const key = (details as { loopGuardKey?: unknown }).loopGuardKey;
    return typeof key === "string" && key ? key : undefined;
  });
  return keys.every((key): key is string => Boolean(key))
    ? keys.join("\0")
    : undefined;
}

function outcomeSignature(
  results: ShouldStopAfterTurnContext["toolResults"],
): string {
  const value = results.map((result) => ({
    toolName: result.toolName,
    isError: result.isError,
    content: result.content,
  }));
  return signature(value);
}

function signature(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value) ?? "undefined")
    .digest("hex");
}

function isTerminalModelFailure(
  message: ShouldStopAfterTurnContext["message"],
): boolean {
  if (message.stopReason !== "error") return false;
  return /prompt_too_large|context length|maximum context|too large|terminated|insufficient_credits|credit_exhausted|Credit 余额不足|402/iu.test(
    message.errorMessage ?? "",
  );
}
