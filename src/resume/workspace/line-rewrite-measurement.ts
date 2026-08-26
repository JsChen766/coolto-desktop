import type { ResumeCompiler } from "./compiler-port.js";
import type { ResumeWorkspace } from "./types.js";

export interface LineRewriteTarget {
  bulletId: string;
  existing: string;
  baselineLines: number;
  revisedText: string;
}

export interface MeasuredLineRewrite {
  bulletId: string;
  text: string;
  addedLines: number;
  characterGrowth: number;
  lineCount: number;
  lastLineRatio: number;
  tailPassed: boolean;
  withinLineLimit: boolean;
  eligible: boolean;
}

export async function measureLineRewrites(
  workspace: ResumeWorkspace,
  targets: readonly LineRewriteTarget[],
  compiler: ResumeCompiler,
): Promise<MeasuredLineRewrite[]> {
  if (!targets.length) return [];
  const texts = new Map(targets.map((target) => [
    target.bulletId,
    target.revisedText,
  ]));
  const result = await compiler.compile(structureWithTexts(workspace, texts));
  return targets.map((target) => {
    const bullet = result.bullets.find(
      (candidate) => candidate.bulletId === target.bulletId,
    );
    if (!bullet) throw new Error(`bullet ${target.bulletId} 缺少扩写测量`);
    const addedLines = bullet.lineCount - target.baselineLines;
    const characterGrowth = [...target.revisedText].length -
      [...target.existing].length;
    const linePlan = workspace.bulletLinePlans?.[target.bulletId];
    const lineLimit = workspace.factNeutralAuthorization
      ? undefined
      : linePlan?.lockedLines ?? linePlan?.plannedLines;
    const withinLineLimit = lineLimit === undefined ||
      bullet.lineCount <= lineLimit;
    return {
      bulletId: target.bulletId,
      text: target.revisedText,
      addedLines,
      characterGrowth,
      lineCount: bullet.lineCount,
      lastLineRatio: bullet.lastLineRatio,
      tailPassed: bullet.passed,
      withinLineLimit,
      eligible: characterGrowth > 0 && addedLines >= 0 && withinLineLimit,
    };
  });
}

function structureWithTexts(
  workspace: ResumeWorkspace,
  texts: ReadonlyMap<string, string>,
) {
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
