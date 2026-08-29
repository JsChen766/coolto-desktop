import { extractEvidenceNumbers } from "../evidence-numbers.js";
import { findRepeatedFragment } from "../planning/text-repetition.js";
import { findResumePaddingIssue } from "../planning/text-padding.js";
import { resolveGroundedEvidence } from "./agent-workspace-evidence.js";
import type { AgentBulletContentInput } from "./agent-content-types.js";
import type { ResumeBulletProvenance, ResumeWorkspace } from "./types.js";
import { plannedBulletLines } from "./bullet-line-plan.js";
import { matchingFactNeutralFragment } from "./fact-neutral-fragments.js";
import { validateFactNeutralFragment } from "./fact-neutral-validation.js";

export function buildValidatedBullet(input: {
  source: ResumeWorkspace;
  item: ResumeWorkspace["structure"]["sections"][number]["items"][number];
  bullet: AgentBulletContentInput;
  index: number;
  retainedIds: Set<string>;
  retainedTexts: string[];
}) {
  const text = input.bullet.text.trim();
  if (!text) throw new Error("bullet 文本为空");
  if (hasTrailingPunctuation(text)) throw new Error("bullet 末尾不得有句末标点");
  const repeated = findRepeatedFragment(text);
  if (repeated) throw new Error(`bullet 包含重复片段：${repeated}`);
  const previousId = input.item.bullets[input.index]?.id;
  const bulletId =
    input.bullet.bulletId?.trim() ||
    previousId ||
    `${input.item.id}-bullet-${input.index + 1}`;
  const neutralFragment = matchingFactNeutralFragment(
    input.source,
    bulletId,
    text,
  );
  const evidenceText = neutralFragment?.baseText ?? text;
  if (neutralFragment) {
    validateFactNeutralFragment(
      neutralFragment.fragmentText,
      input.source.structure.language,
    );
  }
  const paddingIssue = findResumePaddingIssue(evidenceText);
  if (paddingIssue) {
    throw new Error(
      `bullet 包含${paddingIssue}；新增内容必须具体修饰已有动作、对象、方法或结果`,
    );
  }
  const previousBullet = input.item.bullets.find((item) => item.id === bulletId);
  const previousProvenance = (input.source.bulletProvenance ?? []).find(
    (item) => item.bulletId === bulletId,
  );
  if (input.retainedIds.has(bulletId)) throw new Error(`bulletId 重复：${bulletId}`);
  input.retainedIds.add(bulletId);
  const key = normalized(text);
  if (input.retainedTexts.includes(key)) throw new Error("bullet 文本与当前简历完全重复");
  input.retainedTexts.push(key);
  const requirementIds = [...new Set(input.bullet.requirementIds ?? [])];
  assertRequirementIds(input.source, requirementIds);
  let evidenceIds: string[] = [];
  let binding;
  if (input.bullet.origin === "grounded") {
    const resolved = resolveGroundedEvidence({
      snapshot: input.source.sourceSnapshot,
      supplemental: input.source.supplementalEvidence ?? [],
      item: input.item,
      bulletId,
      text: evidenceText,
      evidenceIds: input.bullet.evidenceIds ?? [],
      requirementIds,
    });
    evidenceIds = resolved.evidenceIds;
    binding = resolved.binding;
  } else {
    if ((input.bullet.evidenceIds ?? []).length) {
      throw new Error("agent_augmented bullet 不得伪造 evidenceIds");
    }
    if (
      extractEvidenceNumbers(text).length ||
      text.toLocaleLowerCase().includes("xx")
    ) {
      throw new Error("agent_augmented bullet 不得包含未确认数字或 XX 占位符");
    }
  }
  const provenance: ResumeBulletProvenance = {
    bulletId,
    itemId: input.item.id,
    origin: input.bullet.origin,
    evidenceIds,
    requirementIds,
    confirmation:
      input.bullet.origin === "agent_augmented"
        ? previousProvenance?.origin === "agent_augmented" &&
          previousProvenance.confirmation === "confirmed" &&
          previousBullet?.text.trim() === text
          ? "confirmed"
          : "pending"
        : "not_required",
  };
  return {
    bullet: {
      id: bulletId,
      text,
      matched_jd_requirement_ids: requirementIds,
      source_fact_ids: evidenceIds,
      ...(binding
        ? {
            source_evidence: binding.excerpts.map((excerpt) => ({
              experience_id: excerpt.experienceId,
              revision_id: excerpt.revisionId,
              revision_content_hash: excerpt.revisionContentHash,
              source_start: excerpt.sourceStart,
              source_end: excerpt.sourceEnd,
              source_quote: excerpt.sourceQuote,
            })),
          }
        : {}),
    },
    provenance,
    binding,
    plannedLines: plannedBulletLines(
      input.bullet.plannedLines ??
        input.source.bulletLinePlans?.[bulletId]?.plannedLines,
    ),
  };
}

function assertRequirementIds(workspace: ResumeWorkspace, ids: string[]): void {
  const allowed = new Set(
    workspace.sourceSnapshot.jd.requirements.map((item) => item.id),
  );
  const unknown = ids.filter((id) => !allowed.has(id));
  if (unknown.length) throw new Error(`未知 JD requirementId：${unknown.join("、")}`);
}

function normalized(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

function hasTrailingPunctuation(value: string): boolean {
  return new Set(["。", ".", "！", "!", "？", "?", "；", ";", "：", ":"]).has(
    value.at(-1) ?? "",
  );
}
