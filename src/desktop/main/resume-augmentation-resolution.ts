import type { CooltoAgent } from "../../agent/coolto-agent.js";
import type { ApprovalDecision } from "../../approvals/types.js";
import { RESUME_AUGMENTED_CONFIRM_ACTION_TYPE } from "../../resume/confirmation/augmented-approval.js";
import { runContinuationPrompt } from "./agent-runtime-prompt.js";
import { buildResumeAugmentationContinuationPrompt } from "./resume-augmentation-continuation.js";

interface ResumeAugmentationResolutionInput {
  actionType?: string;
  decision: ApprovalDecision;
  cancelled: boolean;
  candidateId?: string;
  agent: CooltoAgent;
  syncWorkspace: () => Promise<void>;
}

export async function continueAfterResumeAugmentation(
  input: ResumeAugmentationResolutionInput,
): Promise<void> {
  if (input.actionType !== RESUME_AUGMENTED_CONFIRM_ACTION_TYPE) return;
  await input.syncWorkspace();
  const { candidateId, decision } = input;
  if (
    input.cancelled ||
    !candidateId ||
    (decision.type !== "accept" && decision.type !== "reject")
  ) return;
  await runContinuationPrompt(() =>
    input.agent.prompt(
      buildResumeAugmentationContinuationPrompt(
        candidateId,
        decision.type,
      ),
    ),
  );
}
