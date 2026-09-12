import { resolveResumeTerminalState } from "./terminal-state.js";
import type { ResumeWorkspace } from "./types.js";

export type ResumeReadAsset = "jd" | "experience" | "resume" | "workspace";

export interface ResumeReadLedger {
  claim(asset: ResumeReadAsset, key: string): boolean;
  release(asset: ResumeReadAsset, key: string): void;
  reset(): void;
}

export interface ResumeRecoveryDecision {
  action: "continue" | "reread_current_state" | "stop";
  continueAutomatically: boolean;
  candidateId?: string;
  revision?: number;
  reason: string;
}

/** Prevents the same fact asset from being read twice in one user turn. */
export function createResumeReadLedger(): ResumeReadLedger {
  const claims = new Set<string>();
  return {
    claim(asset, key) {
      const normalized = key.trim();
      if (!normalized) return false;
      const claim = `${asset}\0${normalized}`;
      if (claims.has(claim)) return false;
      claims.add(claim);
      return true;
    },
    release(asset, key) {
      const normalized = key.trim();
      if (normalized) claims.delete(`${asset}\0${normalized}`);
    },
    reset() {
      claims.clear();
    },
  };
}

/** Compares persisted state with the state a recovery attempt expected. */
export function resumeRecoveryDecision(input: {
  workspace: ResumeWorkspace | undefined;
  expectedRevision?: number;
  expectedSourceFingerprint?: string;
  expectedProfileEntityVersion?: number;
  expectedProfileLocalVersion?: number;
  expectedPreferenceResolutionHash?: string;
  expectedTargetFingerprint?: string | null;
}): ResumeRecoveryDecision {
  const workspace = input.workspace;
  if (!workspace) {
    return {
      action: "reread_current_state",
      continueAutomatically: false,
      reason: "当前简历工作区不可用，必须重新读取当前 JD、Experience、Resume 和 workspace",
    };
  }
  const staleRevision = input.expectedRevision !== undefined &&
    input.expectedRevision !== workspace.revision;
  const staleSource = input.expectedSourceFingerprint !== undefined &&
    input.expectedSourceFingerprint !== workspace.sourceSnapshot.sourceFingerprint;
  const staleProfile = input.expectedProfileEntityVersion !== undefined &&
    input.expectedProfileEntityVersion !== workspace.profilePreferenceBinding?.profileEntityVersion;
  const staleLocalProfile = input.expectedProfileLocalVersion !== undefined &&
    input.expectedProfileLocalVersion !== workspace.profilePreferenceBinding?.profileLocalVersion;
  const stalePreferences = input.expectedPreferenceResolutionHash !== undefined &&
    input.expectedPreferenceResolutionHash !== workspace.profilePreferenceBinding?.preferenceResolutionHash;
  const staleTarget = input.expectedTargetFingerprint !== undefined &&
    input.expectedTargetFingerprint !== workspace.profilePreferenceBinding?.targetFingerprint;
  if (staleRevision || staleSource || staleProfile || staleLocalProfile || stalePreferences || staleTarget) {
    const staleReasons = [
      staleRevision ? "revision" : null, staleSource ? "source" : null,
      staleProfile || staleLocalProfile ? "Profile" : null,
      stalePreferences ? "Preference" : null,
      staleTarget ? "target" : null,
    ].filter((value): value is string => value !== null);
    return {
      action: "reread_current_state",
      continueAutomatically: false,
      candidateId: workspace.candidateId,
      revision: workspace.revision,
      reason: `当前 workspace 的 ${staleReasons.join("、")} 已变化，必须重新读取当前状态`,
    };
  }
  const terminal = resolveResumeTerminalState(workspace);
  if (terminal.kind !== "running") {
    return {
      action: "stop",
      continueAutomatically: false,
      candidateId: workspace.candidateId,
      revision: workspace.revision,
      reason: "当前 workspace 已进入终态；不得继续隐藏 continuation",
    };
  }
  return {
    action: "continue",
    continueAutomatically: true,
    candidateId: workspace.candidateId,
    revision: workspace.revision,
    reason: "当前 workspace 与恢复预期一致，可按最新 nextAction 继续",
  };
}
