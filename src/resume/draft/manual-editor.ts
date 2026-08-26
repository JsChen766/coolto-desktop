import type { ResumeCompiler } from "../workspace/compiler-port.js";
import { RESUME_LAYOUT_TOLERANCE_PX } from "../compiler-types.js";
import { withResumeLineSpacing } from "../layout-line-spacing.js";
import { applyCandidatePatch } from "../workspace/candidate-patch.js";
import { ResumeWorkspaceError } from "../workspace/errors.js";
import { generationWorkspaceStatus } from "../workspace/generation-readiness.js";
import type { ResumeWorkspace } from "../workspace/types.js";
import { supplementalNumericEvidenceForBullet } from
  "../workspace/agent-content-state.js";

export type ResumeManualEditTarget =
  | { type: "bullet"; bulletId: string }
  | { type: "raw_text"; itemId: string };

export class ResumeManualEditor {
  public constructor(private readonly compiler: ResumeCompiler) {}

  public async edit(
    source: ResumeWorkspace,
    target: ResumeManualEditTarget,
    rawText: string,
  ): Promise<ResumeWorkspace> {
    const text = rawText.trim();
    if (!text) throw new Error("简历内容不能为空");
    const edited =
      target.type === "bullet"
        ? editBullet(source, target.bulletId, text)
        : editRawText(source, target.itemId, text);
    return this.compileEdit(
      source,
      clearQualityMetadata(edited.structure),
      edited.bindings,
    );
  }

  public async setLineSpacing(
    source: ResumeWorkspace,
    scalePercent: number,
  ): Promise<ResumeWorkspace> {
    const structure = clearQualityMetadata(
      withResumeLineSpacing(source.structure, scalePercent),
    );
    return this.compileEdit(
      source,
      structure,
      structuredClone(source.bindings),
      true,
    );
  }

  private async compileEdit(
    source: ResumeWorkspace,
    structure: ResumeWorkspace["structure"],
    bindings: ResumeWorkspace["bindings"],
    rejectPageOverflow = false,
  ): Promise<ResumeWorkspace> {
    const compileResult = await this.compiler.compile(structure);
    if (
      rejectPageOverflow &&
      (
        compileResult.pageCount > 1 ||
        compileResult.overflowPx > RESUME_LAYOUT_TOLERANCE_PX ||
        compileResult.usageRatio > compileResult.effectiveTargetBand.maximum
      )
    ) {
      throw new ResumeWorkspaceError(
        "layout_line_spacing_overflow",
        "继续增大行间距将超过一页，已保持原行间距",
      );
    }
    const revision = source.revision + 1;
    const { qualityReport: _qualityReport, ...withoutQuality } = source;
    const updated: ResumeWorkspace = {
      ...withoutQuality,
      revision,
      patchCount: source.patchCount + 1,
      status: "writing",
      structure,
      bindings,
      compileResult,
      compileObservedRevision: revision,
      bestSnapshot: {
        revision,
        structure: structuredClone(structure),
        bindings: structuredClone(bindings),
        compileResult: structuredClone(compileResult),
      },
      qualityReviewStarted: false,
      repairRound: 0,
      repairHistory: [],
    };
    updated.status = generationWorkspaceStatus(updated);
    return updated;
  }
}

function editBullet(
  source: ResumeWorkspace,
  bulletId: string,
  text: string,
) {
  const binding = source.bindings.find(
    (candidate) => candidate.bulletId === bulletId,
  );
  if (!binding) {
    throw new ResumeWorkspaceError(
      "bullet_not_found",
      `Bullet ${bulletId} was not found.`,
    );
  }
  return applyCandidatePatch(
    source.sourceSnapshot,
    source.structure,
    source.bindings,
    [
      {
        op: "replace_bullet",
        bulletId,
        binding: { ...structuredClone(binding), bulletText: text },
      },
    ],
    new Map(source.bindings.flatMap((candidate) => {
      const evidence = supplementalNumericEvidenceForBullet(
        source, source.bulletProvenance, candidate.bulletId,
        candidate.sourceExperienceId,
      );
      return evidence ? [[candidate.bulletId, evidence]] : [];
    })),
  );
}

function editRawText(
  source: ResumeWorkspace,
  itemId: string,
  text: string,
) {
  const structure = structuredClone(source.structure);
  const section = structure.sections.find((candidate) =>
    candidate.items.some((item) => item.id === itemId),
  );
  const item = section?.items.find((candidate) => candidate.id === itemId);
  if (!section || !item) {
    throw new ResumeWorkspaceError(
      "item_not_found",
      `Item ${itemId} was not found.`,
    );
  }
  if (section.type === "education") {
    throw new Error("教育信息来自经历库，不能在单份简历中修改");
  }
  item.raw_text = text;
  return { structure, bindings: structuredClone(source.bindings) };
}

function clearQualityMetadata(
  source: ResumeWorkspace["structure"],
): ResumeWorkspace["structure"] {
  const structure = structuredClone(source);
  delete structure.quality_status;
  delete structure.quality_issues;
  delete structure.layout_usage_ratio;
  return structure;
}
