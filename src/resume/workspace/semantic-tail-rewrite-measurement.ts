import type { ResumeCompiler } from "./compiler-port.js";
import { resolveTailPolicy } from "../tail-policy.js";
import { buildTailLengthBudget, type TailLengthBudget } from
  "./tail-length-budget.js";
import type { SemanticTailRewriteStrategy } from
  "./semantic-tail-rewrite-types.js";
import type { ResumeWorkspace } from "./types.js";

export interface PreparedSemanticTailCandidate {
  bulletId: string;
  candidateIndex: number;
  strategy: SemanticTailRewriteStrategy;
  currentText: string;
  currentLineCount: number;
  revisedText: string;
  evidenceIds: string[];
  contentMode?: "fact_neutral";
}

export interface MeasuredSemanticTailCandidate
  extends PreparedSemanticTailCandidate {
  lineCount: number;
  lastLineRatio: number;
  tailPassed: boolean;
  pageCount: number;
  overflowPx: number;
  usageRatio: number;
  lengthBudget?: TailLengthBudget;
}

/** At most two Chromium rounds: one complete batch for each candidate slot. */
export async function measureSemanticTailCandidates(
  workspace: ResumeWorkspace,
  candidates: readonly PreparedSemanticTailCandidate[],
  compiler: ResumeCompiler,
): Promise<MeasuredSemanticTailCandidate[]> {
  const measured: MeasuredSemanticTailCandidate[] = [];
  const indexes = [...new Set(candidates.map((item) => item.candidateIndex))]
    .sort((left, right) => left - right);
  for (const candidateIndex of indexes) {
    const round = candidates.filter((item) =>
      item.candidateIndex === candidateIndex
    );
    const compile = await compiler.compile(structureWithCandidates(
      workspace,
      round,
    ));
    for (const candidate of round) {
      const bullet = compile.bullets.find((item) =>
        item.bulletId === candidate.bulletId
      );
      if (!bullet) {
        throw new Error(`bullet ${candidate.bulletId} 缺少语义尾行实测`);
      }
      const lengthBudget = buildTailLengthBudget(
        bullet,
        resolveTailPolicy(bullet.tailPolicyVersion),
      );
      measured.push({
        ...candidate,
        lineCount: bullet.lineCount,
        lastLineRatio: bullet.lastLineRatio,
        tailPassed: bullet.passed,
        pageCount: compile.pageCount,
        overflowPx: compile.overflowPx,
        usageRatio: compile.usageRatio,
        ...(lengthBudget ? { lengthBudget } : {}),
      });
    }
  }
  return measured;
}

export async function measureSemanticTailSelection(
  workspace: ResumeWorkspace,
  candidates: readonly PreparedSemanticTailCandidate[],
  compiler: ResumeCompiler,
) {
  return compiler.compile(structureWithCandidates(workspace, candidates));
}

function structureWithCandidates(
  workspace: ResumeWorkspace,
  candidates: readonly Pick<
    PreparedSemanticTailCandidate,
    "bulletId" | "revisedText"
  >[],
) {
  const texts = new Map(candidates.map((candidate) => [
    candidate.bulletId,
    candidate.revisedText,
  ]));
  const structure = structuredClone(workspace.structure);
  for (const section of structure.sections) {
    for (const item of section.items) {
      for (const bullet of item.bullets) {
        bullet.text = texts.get(bullet.id) ?? bullet.text;
      }
    }
  }
  return structure;
}
