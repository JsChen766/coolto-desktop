import { getResumeFixture } from "../../src/resume/fixtures.js";
import type { ResumePdfCompiler } from "../../src/resume/export/types.js";
import {
  generationWorkspaceStatus,
  resumeGenerationReadiness,
} from "../../src/resume/workspace/generation-readiness.js";
import type { ResumeStructure } from "../../src/resume/types.js";
import type { ResumeWorkspace } from "../../src/resume/workspace/types.js";
import { createReadySaveFixture } from "./resume-save-fixture.js";

const SENTENCE_END_CHARS = new Set([
  "。", ".", "！", "!", "？", "?", "；", ";", "：", ":",
]);

function stripTrailingSentencePunctuation(
  structure: ResumeStructure,
): ResumeStructure {
  const cloned = structuredClone(structure);
  for (const section of cloned.sections) {
    for (const item of section.items) {
      for (const bullet of item.bullets) {
        let text = bullet.text.trimEnd();
        while (text.length && SENTENCE_END_CHARS.has(text.at(-1)!)) {
          text = text.slice(0, -1).trimEnd();
        }
        bullet.text = text;
      }
    }
  }
  return cloned;
}

/** Local Electron QA draft: real Chromium compile + export gates aligned. */
export async function createQaChromiumQualifiedWorkspace(
  compiler: ResumePdfCompiler,
): Promise<ResumeWorkspace> {
  const { ready } = await createReadySaveFixture();
  const structure = stripTrailingSentencePunctuation(
    getResumeFixture("education-details-qualified"),
  );
  const compileResult = await compiler.compile(structure);
  if (!compileResult.qualified) {
    const codes = compileResult.violations.map((item) => item.code).join(", ");
    throw new Error(`QA PDF seed compile unqualified: ${codes}`);
  }
  const itemTiers: NonNullable<ResumeWorkspace["itemTiers"]> = {};
  const bulletProvenance: NonNullable<ResumeWorkspace["bulletProvenance"]> = [];
  for (const section of structure.sections) {
    for (const item of section.items) {
      if (!["education", "skills"].includes(section.type)) {
        itemTiers[item.id] = item.id === "work-1" ? "main" : "secondary";
      }
      for (const bullet of item.bullets) {
        bulletProvenance.push({
          bulletId: bullet.id,
          itemId: item.id,
          origin: "agent_augmented",
          evidenceIds: [],
          requirementIds: [],
          confirmation: "confirmed",
        });
      }
    }
  }
  const {
    workUnitMap: _workUnitMap,
    lineBudgetVersion: _lineBudgetVersion,
    itemLineBudgets: _itemLineBudgets,
    ...readyBase
  } = ready;
  const workspace: ResumeWorkspace = {
    ...readyBase,
    structure,
    compileResult,
    compileObservedRevision: ready.revision,
    bindings: [],
    bulletProvenance,
    itemTiers,
    bestSnapshot: {
      ...ready.bestSnapshot,
      structure: structuredClone(structure),
      compileResult: structuredClone(compileResult),
      bindings: [],
    },
  };
  workspace.status = generationWorkspaceStatus(workspace);
  const readiness = resumeGenerationReadiness(workspace);
  if (!readiness.ready) {
    const codes = readiness.blockers.map((item) => item.code).join(", ");
    throw new Error(`QA PDF seed not export-ready: ${codes}`);
  }
  return workspace;
}
