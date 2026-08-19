import type { ResumeCompiler } from "../workspace/compiler-port.js";
import { applyCandidatePatch } from "../workspace/candidate-patch.js";
import { ResumeWorkspaceError } from "../workspace/errors.js";
import { generationWorkspaceStatus } from "../workspace/generation-readiness.js";
import type { ResumeWorkspace } from "../workspace/types.js";

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
    const structure = clearQualityMetadata(edited.structure);
    const compileResult = await this.compiler.compile(structure);
    const revision = source.revision + 1;
    const { qualityReport: _qualityReport, ...withoutQuality } = source;
    const updated: ResumeWorkspace = {
      ...withoutQuality,
      revision,
      patchCount: source.patchCount + 1,
      status: "writing",
      structure,
      bindings: edited.bindings,
      compileResult,
      compileObservedRevision: revision,
      bestSnapshot: {
        revision,
        structure: structuredClone(structure),
        bindings: structuredClone(edited.bindings),
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
