import {
  EvidenceLedger,
  EvidenceValidationError,
} from "../evidence-ledger.js";
import type { AgentItemContentInput } from "./agent-content-types.js";
import { buildValidatedBullet } from "./agent-content-validation.js";
import type {
  WorkspaceBulletValidationError,
} from "./agent-workspace-view.js";
import type { ResumeWorkspace } from "./types.js";
import { supplementalNumericEvidenceForBullet } from
  "./agent-content-state.js";

type ResumeItem =
  ResumeWorkspace["structure"]["sections"][number]["items"][number];
type ValidatedBullet = ReturnType<typeof buildValidatedBullet>;

/**
 * Validates every submitted bullet independently so one bad bullet does not
 * hide the remaining actionable errors in the same item submission.
 */
export function validateAgentItemBullets(input: {
  source: ResumeWorkspace;
  item: ResumeItem;
  bullets: AgentItemContentInput["bullets"];
  bindings: ResumeWorkspace["bindings"];
  provenance: NonNullable<ResumeWorkspace["bulletProvenance"]>;
  retainedIds: Set<string>;
  retainedTexts: string[];
}): {
  built: ValidatedBullet[];
  errors: WorkspaceBulletValidationError[];
} {
  const oldIds = new Set(input.item.bullets.map((bullet) => bullet.id));
  const baseBindings = input.bindings.filter(
    (binding) => !oldIds.has(binding.bulletId),
  );
  const supplemental = new Set(
    (input.source.supplementalEvidence ?? []).map((entry) => entry.evidenceId),
  );
  const usedSupplemental = new Set(
    input.provenance
      .filter((entry) => entry.itemId !== input.item.id)
      .flatMap((entry) => entry.evidenceIds)
      .filter((evidenceId) => supplemental.has(evidenceId)),
  );
  let retainedIds = new Set(input.retainedIds);
  let retainedTexts = [...input.retainedTexts];
  const acceptedBindings = [...baseBindings];
  const built: ValidatedBullet[] = [];
  const errors: WorkspaceBulletValidationError[] = [];

  input.bullets.forEach((bullet, index) => {
    const nextIds = new Set(retainedIds);
    const nextTexts = [...retainedTexts];
    try {
      const entry = buildValidatedBullet({
        source: input.source,
        item: input.item,
        bullet,
        index,
        retainedIds: nextIds,
        retainedTexts: nextTexts,
      });
      assertSupplementalAvailable(entry.provenance.evidenceIds, {
        supplemental,
        usedSupplemental,
      });
      validateBindings(input.source, [
        ...acceptedBindings,
        ...(entry.binding ? [entry.binding] : []),
      ], [
        ...input.provenance,
        ...built.map((accepted) => accepted.provenance),
        entry.provenance,
      ]);
      built.push(entry);
      if (entry.binding) acceptedBindings.push(entry.binding);
      entry.provenance.evidenceIds
        .filter((evidenceId) => supplemental.has(evidenceId))
        .forEach((evidenceId) => usedSupplemental.add(evidenceId));
      retainedIds = nextIds;
      retainedTexts = nextTexts;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({
        bulletIndex: index,
        bulletId: bullet.bulletId?.trim() ||
          input.item.bullets[index]?.id ||
          `${input.item.id}-bullet-${index + 1}`,
        code: errorCode(error, message),
        message,
      });
    }
  });
  return { built, errors };
}

function validateBindings(
  workspace: ResumeWorkspace,
  bindings: ResumeWorkspace["bindings"],
  provenance: ResumeWorkspace["bulletProvenance"],
): void {
  const ledger = new EvidenceLedger(workspace.sourceSnapshot);
  bindings.forEach((binding) => ledger.reserve(
    binding,
    supplementalNumericEvidenceForBullet(
      workspace, provenance, binding.bulletId, binding.sourceExperienceId,
    ),
  ));
}

function assertSupplementalAvailable(
  evidenceIds: readonly string[],
  state: { supplemental: Set<string>; usedSupplemental: Set<string> },
): void {
  const duplicate = evidenceIds.find(
    (id) => state.supplemental.has(id) && state.usedSupplemental.has(id),
  );
  if (duplicate) {
    throw new Error(`用户补充 evidence 只能用于一条 bullet：${duplicate}`);
  }
}

function errorCode(error: unknown, message: string): string {
  if (error instanceof EvidenceValidationError) return error.code;
  if (message.includes("句末标点")) return "trailing_punctuation";
  if (message.includes("必须引用至少一个")) return "missing_evidence";
  if (message.includes("数字缺少来源")) return "unsupported_numeric_claim";
  if (message.includes("连续抽象") || message.includes("空泛效果")) {
    return "padding_text";
  }
  if (message.includes("重复")) return "duplicate_content";
  return "bullet_validation";
}
