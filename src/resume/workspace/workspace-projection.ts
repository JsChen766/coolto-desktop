import type { ResumeCompileViolation } from "../compiler-types.js";
import type { ResumeStructure } from "../types.js";
import { calculateResumeBudget, requirementCoverage } from "./candidate-budget.js";
import { unwrittenExperienceItemIds } from "./candidate-content.js";
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
    structure: workspace.structure,
    visibleText: resumeVisibleText(workspace.structure),
    evidenceBindings: workspace.bindings,
    requirementCoverage: coverage,
    budget: calculateResumeBudget(workspace.compileResult),
    compile: workspace.compileResult,
    contentDiagnostics: {
      unwrittenExperienceItemIds: unwrittenExperienceItemIds(workspace.structure),
    },
    bulletTailDiagnostics: bulletTailDiagnostics(workspace),
    bestSnapshot: {
      revision: workspace.bestSnapshot.revision,
      qualified:
        workspace.bestSnapshot.compileResult.qualified &&
        unwrittenExperienceItemIds(workspace.bestSnapshot.structure).length === 0,
      layoutQualified: workspace.bestSnapshot.compileResult.qualified,
      usageRatio: workspace.bestSnapshot.compileResult.usageRatio,
      violationCodes: workspace.bestSnapshot.compileResult.violations.map(
        (violation) => violation.code,
      ),
    },
    instruction: instructionFor(workspace),
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
  return workspace.compileResult.violations
    .filter(
      (violation): violation is ResumeCompileViolation & { bulletId: string } =>
        violation.code === "bullet_tail_too_short" && Boolean(violation.bulletId),
    )
    .map((violation) => {
      const measurement = byId.get(violation.bulletId);
      const requiredWidthPx = (measurement?.availableLineWidthPx ?? 0) * 0.6671;
      return {
        bulletId: violation.bulletId,
        lineCount: measurement?.lineCount ?? 0,
        lastLineWidthPx: measurement?.lastLineWidthPx ?? 0,
        availableLineWidthPx: measurement?.availableLineWidthPx ?? 0,
        requiredWidthPx: round(requiredWidthPx),
        deficitPx: round(
          Math.max(0, requiredWidthPx - (measurement?.lastLineWidthPx ?? 0)),
        ),
      };
    });
}

function instructionFor(workspace: ResumeWorkspace): string {
  if (workspace.status === "layout_qualified") {
    return "All G3 source and layout gates pass. Stop patching; G4 quality review is still required before approval.";
  }
  if (workspace.status === "writing") {
    const unwritten = unwrittenExperienceItemIds(workspace.structure);
    if (unwritten.length) {
      return `These source-backed experience items still need at least one distinct bullet: ${unwritten.join(", ")}. Use the complete visibleText, unused evidence, JD coverage, and pixel budget before declaring completion.`;
    }
    return "The page is underfilled. Use the complete visibleText, unused source evidence, JD coverage, and pixel budget to add the next grounded bullet batch.";
  }
  return "Fix the highest-priority source or layout violation with a local patch; do not rewrite the complete resume.";
}

function round(value: number): number {
  return Number(value.toFixed(4));
}
