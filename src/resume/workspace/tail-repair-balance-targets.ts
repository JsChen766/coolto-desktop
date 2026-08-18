import { withEditInstruction } from "./tail-repair-edit-instruction.js";
import type { TailRepairTarget } from "./tail-repair-targets.js";
import type {
  TailRepairRetryGuidance,
  TailRepairRetryState,
} from "./tail-repair-state.js";
import type { ResumeWorkspace } from "./types.js";

export function activeTailRepairTargets(
  workspace: ResumeWorkspace,
  failed: TailRepairTarget[],
  all: TailRepairTarget[],
): TailRepairTarget[] {
  const retry = workspace.tailRepairRetry;
  if (!retry?.bulletIds.length) return failed;
  const pageCapacity = retry.bulletIds.flatMap((bulletId) => {
    const guidance = guidanceFor(retry, bulletId);
    return guidance?.mode === "page_capacity"
      ? [{ bulletId, guidance }]
      : [];
  });
  if (!pageCapacity.length) return failed;

  const usedPartners = new Set<string>();
  const balanceTargets = pageCapacity.flatMap(({ bulletId, guidance }) => {
    const requestedLineDelta = balanceDirection(guidance);
    const compatible = all.filter((target) =>
      target.bulletId !== bulletId && !usedPartners.has(target.bulletId) &&
      target.evidenceIds.length > 0 && target.sourceQuotes.length > 0 &&
      supportsDelta(target, requestedLineDelta)
    ).sort((left, right) =>
      roleRank(left.role) - roleRank(right.role) ||
      left.bulletId.localeCompare(right.bulletId)
    );
    const cached = new Set(retry.attempts.filter((attempt) =>
      attempt.eligible && Math.sign(attempt.lineDelta) === requestedLineDelta
    ).map((attempt) => attempt.bulletId));
    const unused = compatible.filter((target) => !cached.has(target.bulletId));
    const partners = (unused.length ? unused : compatible).slice(
      0,
      requiredPartnerCount(guidance),
    );
    partners.forEach((partner) => usedPartners.add(partner.bulletId));
    return partners.map((partner) => withEditInstruction({
        ...partner,
        balanceForBulletId: bulletId,
        requestedLineDelta,
        retryGuidance: guidanceFor(retry, partner.bulletId) ?? guidance,
      }, requestedLineDelta));
  });
  return dedupe([...failed, ...balanceTargets]);
}

function guidanceFor(
  retry: TailRepairRetryState,
  bulletId: string,
): TailRepairRetryGuidance | undefined {
  return retry.guidanceByBulletId?.[bulletId] ??
    (retry.bulletIds.includes(bulletId) ? retry.guidance : undefined);
}

function balanceDirection(guidance: TailRepairRetryGuidance): -1 | 1 {
  return guidance.bestObserved.lineDelta >
      guidance.allowedNetLineDelta.maximum ? -1 : 1;
}

function supportsDelta(target: TailRepairTarget, delta: -1 | 1): boolean {
  return delta < 0
    ? Boolean(target.compactTotalCharacterTargets)
    : Boolean(target.addOneLineModifierCharacterTargets);
}

function requiredPartnerCount(guidance: TailRepairRetryGuidance): number {
  const observed = guidance.bestObserved.lineDelta;
  const allowed = guidance.allowedNetLineDelta;
  return Math.max(1, observed > allowed.maximum
    ? observed - allowed.maximum
    : allowed.minimum - observed);
}

function roleRank(role: TailRepairTarget["role"]): number {
  return role === "page_balance" ? 0 : 1;
}

function dedupe(targets: TailRepairTarget[]): TailRepairTarget[] {
  return [...new Map(targets.map((target) => [target.bulletId, target])).values()];
}
