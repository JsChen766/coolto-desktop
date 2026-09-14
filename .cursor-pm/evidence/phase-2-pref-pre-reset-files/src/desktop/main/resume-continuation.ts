import type { ResumeWorkspace } from "../../resume/workspace/types.js";
import {
  createResumeReadLedger,
  resumeRecoveryDecision as classifyResumeRecovery,
} from "../../resume/workspace/recovery-contract.js";

export { createResumeReadLedger };
export const resumeContinuationDecision = classifyResumeRecovery;
export {
  resolveResumeTerminalState,
  resumeTerminalInstruction,
} from "../../resume/workspace/terminal-state.js";
export type {
  ResumeReadAsset,
  ResumeReadLedger,
  ResumeRecoveryDecision,
} from "../../resume/workspace/recovery-contract.js";
export type {
  ResumeTerminalKind,
  ResumeTerminalState,
} from "../../resume/workspace/terminal-state.js";

/** Restores the persisted snapshot after comparing it with the stale memory copy. */
export function prepareResumeWorkspaceRecovery(
  current: ResumeWorkspace | undefined,
  restored: ResumeWorkspace,
): ResumeWorkspace {
  const sameCandidate = current?.candidateId === restored.candidateId;
  const decision = classifyResumeRecovery({
    workspace: restored,
    ...(sameCandidate && current ? {
      expectedRevision: current.revision,
      expectedSourceFingerprint: current.sourceSnapshot.sourceFingerprint,
      ...(current.profilePreferenceBinding
        ? {
            expectedProfileEntityVersion: current.profilePreferenceBinding.profileEntityVersion,
            ...(current.profilePreferenceBinding.profileLocalVersion === undefined ? {} : {
              expectedProfileLocalVersion: current.profilePreferenceBinding.profileLocalVersion,
            }),
            expectedPreferenceResolutionHash: current.profilePreferenceBinding.preferenceResolutionHash,
            expectedTargetFingerprint: current.profilePreferenceBinding.targetFingerprint,
          }
        : {}),
    } : {}),
  });
  if (decision.action === "reread_current_state") {
    throw new Error(decision.reason);
  }
  return structuredClone(restored);
}
