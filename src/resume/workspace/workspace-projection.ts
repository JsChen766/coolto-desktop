import type { ResumeCompileViolation } from "../compiler-types.js";
import type { ResumeStructure } from "../types.js";
import { calculateResumeBudget, requirementCoverage } from "./candidate-budget.js";
import { unwrittenExperienceItemIds } from "./candidate-content.js";
import { rankAvailableEvidence } from "../quality/evidence-candidates.js";
import { plannedBulletsFor } from "../source-projection.js";
import type { ResumeWorkspace } from "./types.js";

export function projectResumeWorkspace(workspace: ResumeWorkspace): object {
  const coverage = requirementCoverage(
    workspace.sourceSnapshot,
    workspace.bindings,
  );
  return {
    candidateId: workspace.candidateId,
    revision: workspace.revision,
    status: workspace.status,
    sourceFingerprint: workspace.sourceSnapshot.sourceFingerprint,
    structure: idIndex(workspace.structure),
    visibleText: resumeVisibleText(workspace.structure),
    evidenceBindings: workspace.bindings,
    availableEvidence: rankAvailableEvidence(
      workspace.sourceSnapshot,
      workspace.bindings,
    ),
    requirementCoverage: coverage,
    budget: calculateResumeBudget(workspace.compileResult),
    compile: workspace.compileResult,
    contentDiagnostics: {
      unwrittenExperienceItemIds: unwrittenExperienceItemIds(workspace.structure),
    },
    bulletTailDiagnostics: bulletTailDiagnostics(workspace),
    overflowDiagnostic: overflowDiagnostic(workspace),
    writePlan: writePlan(workspace),
    quality: workspace.qualityReport ?? null,
    repairRound: workspace.repairRound,
    repairRoundsRemaining: Math.max(0, 3 - workspace.repairRound),
    repairHistory: workspace.repairHistory,
    bestSnapshot: {
      revision: workspace.bestSnapshot.revision,
      qualified:
        workspace.bestSnapshot.compileResult.qualified &&
        unwrittenExperienceItemIds(workspace.bestSnapshot.structure).length === 0 &&
        (workspace.bestSnapshot.qualityReport?.passed ?? false),
      layoutQualified: workspace.bestSnapshot.compileResult.qualified,
      qualityQualified: workspace.bestSnapshot.qualityReport?.passed ?? false,
      usageRatio: workspace.bestSnapshot.compileResult.usageRatio,
      violationCodes: workspace.bestSnapshot.compileResult.violations.map(
        (violation) => violation.code,
      ),
    },
    instruction: instructionFor(workspace),
  };
}

/**
 * The model only needs stable IDs and the full text (visibleText) to author
 * incremental edits; the full structure JSON is not resent every turn.
 */
function idIndex(structure: ResumeStructure): object {
  return {
    language: structure.language,
    sections: structure.sections.map((section) => ({
      id: section.id,
      type: section.type,
      heading: section.heading,
      items: section.items.map((item) => ({
        id: item.id,
        source_experience_id: item.source_experience_id,
        bullets: item.bullets.map((bullet) => ({ id: bullet.id })),
      })),
    })),
  };
}

function resumeVisibleText(structure: ResumeStructure): string {
  const lines: string[] = [];
  const contact = structure.contact;
  if (contact?.name) lines.push(contact.name);
  const contacts = [
    contact?.phone,
    contact?.email,
    contact?.location,
    contact?.linkedin,
  ].filter(Boolean);
  if (contacts.length) lines.push(contacts.join(" | "));
  for (const section of structure.sections) {
    if (section.heading) lines.push(section.heading);
    for (const item of section.items) {
      lines.push(
        [item.title, item.organization, item.role].filter(Boolean).join(" · "),
      );
      for (const bullet of item.bullets) lines.push(`• ${bullet.text}`);
      if (item.raw_text) lines.push(item.raw_text);
    }
  }
  return lines.filter(Boolean).join("\n");
}

function bulletTailDiagnostics(workspace: ResumeWorkspace): object[] {
  const byId = new Map(
    workspace.compileResult.bullets.map((measurement) => [
      measurement.bulletId,
      measurement,
    ]),
  );
  const charsPerUnit = characterFactor(workspace);
  return workspace.compileResult.violations
    .filter(
      (violation): violation is ResumeCompileViolation & { bulletId: string } =>
        violation.code === "bullet_tail_too_short" && Boolean(violation.bulletId),
    )
    .map((violation) => {
      const measurement = byId.get(violation.bulletId);
      const requiredWidthPx = (measurement?.availableLineWidthPx ?? 0) * 0.6671;
      const deficitPx = Math.max(
        0,
        requiredWidthPx - (measurement?.lastLineWidthPx ?? 0),
      );
      return {
        bulletId: violation.bulletId,
        lineCount: measurement?.lineCount ?? 0,
        lastLineWidthPx: measurement?.lastLineWidthPx ?? 0,
        availableLineWidthPx: measurement?.availableLineWidthPx ?? 0,
        requiredWidthPx: round(requiredWidthPx),
        deficitPx: round(deficitPx),
        shortByChars: Math.max(1, Math.round(deficitPx / charsPerUnit)),
      };
    });
}

function overflowDiagnostic(workspace: ResumeWorkspace): object | null {
  const overflowPx = workspace.compileResult.overflowPx;
  if (overflowPx <= 0) return null;
  const lineHeight = workspace.compileResult.bodyLineHeightPx;
  const charsPerLine =
    workspace.structure.language === "zh-CN"
      ? Math.max(20, Math.round(711 / Math.max(1, fontSizePx(workspace))))
      : Math.max(30, Math.round((711 / Math.max(1, fontSizePx(workspace))) * 1.9));
  const excessLines = lineHeight > 0 ? overflowPx / lineHeight : 1;
  const excessChars = Math.max(1, Math.round(excessLines * charsPerLine));
  return {
    overflowPx: round(overflowPx),
    excessChars,
    guidance: `Trim about ${excessChars} characters total using trim_text or replace_substring (shorten the longest bullets first); never remove evidence-bound facts entirely.`,
  };
}

function writePlan(workspace: ResumeWorkspace): object[] {
  return workspace.structure.sections.flatMap((section) =>
    section.items
      .filter((item) => Boolean(item.source_experience_id))
      .map((item) => {
        const planned = plannedBulletsFor(
          workspace.sourceSnapshot.experiences.find(
            (experience) => experience.id === item.source_experience_id,
          )?.category ?? "other",
        );
        const current = item.bullets.length;
        return {
          itemId: item.id,
          title: item.title,
          bullets: current,
          planned,
          missing: Math.max(0, planned - current),
        };
      }),
  );
}

function instructionFor(workspace: ResumeWorkspace): string {
  if (workspace.status === "ready_for_approval") {
    return "All source, content-quality, font, page, and bullet-tail gates pass. Stop editing; G5 save approval is not implemented yet.";
  }
  if (workspace.status === "needs_user_decision") {
    return "Automatic repair stopped because source support is missing or all three rounds were used. Present the best snapshot and remaining issues without lowering any gate.";
  }
  if (workspace.status === "layout_qualified") {
    return "All G3 source and layout gates pass; the host runs deterministic quality review automatically after this tool result.";
  }
  if (workspace.qualityReviewStarted) {
    return "Use only the reported repairTargets and bounded alternativeTargets. Do not modify frozen bullets or bypass the three-round limit.";
  }
  const budget = calculateResumeBudget(workspace.compileResult);
  const linesPerBullet = Math.max(1, workspace.compileResult.bodyLineHeightPx * 2.2);
  const remainingBullets = Math.max(1, Math.ceil(budget.pxToMinimum / linesPerBullet));
  const bulletChars = bulletCharTarget(workspace);
  const tailHints = bulletTailDiagnostics(workspace)
    .slice(0, 3)
    .map((diagnostic) => {
      const value = diagnostic as { bulletId: string; shortByChars: number };
      return `${value.bulletId}=${value.shortByChars}`;
    })
    .join(", ");
  const continuation =
    "You must continue calling patch_resume_candidate until status is ready_for_approval or needs_user_decision; never stop at writing or needs_revision.";
  const incremental =
    "Prefer incremental operations: append_text / prepend_text / insert_text to lengthen, trim_text or replace_substring to shorten, add_bullet for new items; avoid replace_bullet whole-bullet rewrites.";
  if (workspace.status === "writing") {
    const unwritten = unwrittenExperienceItemIds(workspace.structure);
    if (unwritten.length) {
      return `These source-backed experience items still need at least one distinct bullet: ${unwritten.join(", ")}. Follow writePlan.missing, add them with unused evidence, each about ${bulletChars}. ${incremental} ${continuation}`;
    }
    return `The page is at ${(workspace.compileResult.usageRatio * 100).toFixed(1)}% (need ≥85%), roughly ${remainingBullets} more bullets. Follow writePlan.missing and add bullets about ${bulletChars} each so the last line stays ≥ two-thirds wide. ${incremental} ${continuation}`;
  }
  return `Fix the reported violations in one bounded batch of 2–8 incremental operations. Tail-deficit bullets (${tailHints || "none"}): append_text about shortByChars characters of source-backed facts. Overlong/overflow: trim_text or replace_substring. ${incremental} ${continuation}`;
}

function bulletCharTarget(workspace: ResumeWorkspace): string {
  const compile = workspace.compileResult;
  const fontSize = fontSizePx(workspace);
  const firstBulletWidth = compile.bullets[0]?.availableLineWidthPx;
  const widthPx =
    firstBulletWidth !== undefined && firstBulletWidth > 0
      ? firstBulletWidth
      : 711;
  const charsPerLine =
    workspace.structure.language === "zh-CN"
      ? Math.max(20, Math.round(widthPx / fontSize))
      : Math.max(30, Math.round((widthPx / fontSize) * 1.9));
  const minimum = Math.round(charsPerLine * 1.68);
  const maximum = Math.round(charsPerLine * 2.0);
  return workspace.structure.language === "zh-CN"
    ? `${minimum}–${maximum} 个汉字`
    : `${minimum}–${maximum} characters`;
}

function fontSizePx(workspace: ResumeWorkspace): number {
  const compile = workspace.compileResult;
  return compile.bodyFontSizePx > 0 ? compile.bodyFontSizePx : 13;
}

function characterFactor(workspace: ResumeWorkspace): number {
  const fontSize = fontSizePx(workspace);
  return workspace.structure.language === "zh-CN"
    ? Math.max(1, fontSize)
    : Math.max(1, fontSize / 1.9);
}

function round(value: number): number {
  return Number(value.toFixed(4));
}
