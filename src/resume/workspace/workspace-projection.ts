import type { ResumeStructure } from "../types.js";
import { calculateResumeBudget, requirementCoverage } from "./candidate-budget.js";
import { unwrittenExperienceItemIds } from "./candidate-content.js";
import { rankAvailableEvidence } from "../quality/evidence-candidates.js";
import type { ResumeWorkspace } from "./types.js";
import {
  bulletTailDiagnostics,
  instructionFor,
  overflowDiagnostic,
  writePlan,
} from "./diagnostics-projection.js";

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
export function idIndex(structure: ResumeStructure): object {
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

export function resumeVisibleText(structure: ResumeStructure): string {
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

// Re-exported for model payload and consumers that previously imported them
// from this module; the implementations live in diagnostics-projection.ts.
export {
  bulletTailDiagnostics,
  instructionFor,
  overflowDiagnostic,
  writePlan,
} from "./diagnostics-projection.js";
