import type { CreditOperationSelection } from "../../agent/credit-operation-context.js";
import type { CreditOperationType } from "../../config.js";
import type { AgentPromptInput } from "../shared/types.js";

type SelectionInput = Pick<
  AgentPromptInput,
  "jdReference" | "resumeReference" | "usageContext"
>;

export function selectCreditOperation(
  input: SelectionInput,
  fallbackOperationType: CreditOperationType,
): CreditOperationSelection {
  const explicit = input.usageContext;
  if (explicit) {
    return {
      operationType: explicit.operationType ?? fallbackOperationType,
      ...(explicit.scenarioRunId
        ? { scenarioRunId: explicit.scenarioRunId }
        : {}),
      ...(explicit.operationRunId
        ? { operationRunId: explicit.operationRunId }
        : {}),
    };
  }

  const operationType = input.jdReference
    ? input.jdReference.action === "generate"
      ? "resume_generate"
      : "match_analyze"
    : input.resumeReference
      ? "resume_generate"
      : fallbackOperationType;
  return { operationType };
}
