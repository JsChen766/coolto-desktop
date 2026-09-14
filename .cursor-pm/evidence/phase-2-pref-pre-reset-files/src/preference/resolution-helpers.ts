import type {
  PreferenceKeyV1,
  PreferenceResolutionApplied,
  PreferenceResolutionConflict,
  PreferenceResolutionIgnored,
  PreferenceResolutionOverridden,
  PreferenceScopeV1,
  PreferenceV1,
} from "./types.js";

export interface ResolutionCandidate {
  preferenceId: string;
  key: PreferenceKeyV1;
  value: string | string[];
  valueHash: string;
  scope: PreferenceScopeV1;
  conflictGroup: string;
  scopeRank: number;
  priority: number;
  sourceRank: number;
  confirmedAt: number;
  current: boolean;
}

export function resolveCandidateGroups(candidates: readonly ResolutionCandidate[]): {
  applied: PreferenceResolutionApplied[];
  overridden: PreferenceResolutionOverridden[];
  conflicts: PreferenceResolutionConflict[];
} {
  const groups = new Map<string, ResolutionCandidate[]>();
  for (const candidate of candidates) {
    const group = groups.get(candidate.conflictGroup) ?? [];
    group.push(candidate);
    groups.set(candidate.conflictGroup, group);
  }
  const applied: PreferenceResolutionApplied[] = [];
  const overridden: PreferenceResolutionOverridden[] = [];
  const conflicts: PreferenceResolutionConflict[] = [];
  for (const groupName of [...groups.keys()].sort()) {
    const group = groups.get(groupName)!.sort(compareCandidate);
    const winner = group[0]!;
    const conflicting = group.filter((candidate) => candidate.valueHash !== winner.valueHash);
    if (conflicting.some((candidate) => sameRank(winner, candidate))) {
      conflicts.push({
        key: [...new Set(group.map((candidate) => candidate.key))].sort()[0]!,
        conflictGroup: groupName,
        preferenceIds: group.map((candidate) => candidate.preferenceId).sort(),
        reason: "conflict_equal_rank",
      });
      continue;
    }
    applied.push({
      preferenceId: winner.preferenceId, key: winner.key, value: structuredClone(winner.value),
      valueHash: winner.valueHash, scope: structuredClone(winner.scope),
      reason: winner.current ? "current_turn_override" : "selected_by_precedence",
    });
    for (const candidate of group.slice(1)) {
      overridden.push({
        preferenceId: candidate.preferenceId, key: candidate.key,
        reason: candidate.valueHash === winner.valueHash ? "equivalent_rule_lower_rank" : overrideReason(winner, candidate),
      });
    }
  }
  return { applied, overridden, conflicts };
}

export function compareApplied(left: PreferenceResolutionApplied, right: PreferenceResolutionApplied): number {
  return compareText(left.key, right.key) || compareText(left.preferenceId, right.preferenceId);
}

export function compareOverridden(left: PreferenceResolutionOverridden, right: PreferenceResolutionOverridden): number {
  return compareText(left.preferenceId, right.preferenceId) || compareText(left.key, right.key);
}

export function compareConflict(left: PreferenceResolutionConflict, right: PreferenceResolutionConflict): number {
  return compareText(left.conflictGroup, right.conflictGroup);
}

export function compareIgnored(left: PreferenceResolutionIgnored, right: PreferenceResolutionIgnored): number {
  return compareText(left.preferenceId, right.preferenceId) || compareText(left.reason, right.reason);
}

export function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}

function compareCandidate(left: ResolutionCandidate, right: ResolutionCandidate): number {
  return right.scopeRank - left.scopeRank || right.priority - left.priority ||
    right.sourceRank - left.sourceRank || right.confirmedAt - left.confirmedAt || compareText(left.preferenceId, right.preferenceId);
}

function sameRank(left: ResolutionCandidate, right: ResolutionCandidate): boolean {
  return left.scopeRank === right.scopeRank && left.priority === right.priority &&
    left.sourceRank === right.sourceRank && left.confirmedAt === right.confirmedAt;
}

function overrideReason(winner: ResolutionCandidate, loser: ResolutionCandidate): string {
  if (winner.current) return "current_turn_override";
  if (winner.scopeRank !== loser.scopeRank) return "scope_more_specific";
  if (winner.priority !== loser.priority) return "higher_priority";
  if (winner.sourceRank !== loser.sourceRank) return "explicit_user_precedence";
  return "newer_confirmation";
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
