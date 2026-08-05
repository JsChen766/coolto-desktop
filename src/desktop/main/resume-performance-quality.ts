import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { unwrittenExperienceItemIds } from "../../resume/workspace/candidate-content.js";
import { requirementCoverage } from "../../resume/workspace/candidate-budget.js";
import type { ResumeWorkspace } from "../../resume/workspace/types.js";
import type { ElectronResumeCompilerService } from "./resume-compiler-service.js";

export interface PerformanceQualitySnapshot {
  status: string;
  usageRatio: number;
  qualified: boolean;
  violations: Array<{ code: string; message: string }>;
  qualityPassed: boolean | null;
  qualityScore: number | null;
  qualityIssues: Array<{ code: string; message: string }>;
  bindingCount: number;
  bulletCount: number;
  unwrittenItemIds: string[];
  requirementCoverage: { covered: number; uncovered: number };
}

export interface PerformanceRun {
  sampleId: string;
  iteration: number;
  elapsedMs: number;
  modelCallCount: number;
  compileCount: number;
  repairRoundCount: number;
  status: string | null;
  qualifiedPreviewDelivered: boolean;
  error: string | null;
  stageDurationsMs: Readonly<Record<string, number>>;
  failedToolCount: number;
  toolSequence: string[];
  failedToolErrors: Array<{ name: string; message: string }>;
  modelUsage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
  };
  quality: PerformanceQualitySnapshot | null;
}

export function qualitySnapshot(
  workspace: ResumeWorkspace,
): PerformanceQualitySnapshot {
  const coverage = requirementCoverage(
    workspace.sourceSnapshot,
    workspace.bindings,
  );
  const issues =
    workspace.qualityReport?.issues.map((issue) => ({
      code: issue.code,
      message: issue.message.slice(0, 120),
    })) ?? [];
  return {
    status: workspace.status,
    usageRatio: round4(workspace.compileResult.usageRatio),
    qualified: workspace.compileResult.qualified,
    violations: workspace.compileResult.violations.map((violation) => ({
      code: violation.code,
      message: violation.message.slice(0, 120),
    })),
    qualityPassed: workspace.qualityReport?.passed ?? null,
    qualityScore: workspace.qualityReport?.score.overall ?? null,
    qualityIssues: issues.slice(0, 8),
    bindingCount: workspace.bindings.length,
    bulletCount: workspace.structure.sections.reduce(
      (total, section) =>
        total +
        section.items.reduce((sum, item) => sum + item.bullets.length, 0),
      0,
    ),
    unwrittenItemIds: unwrittenExperienceItemIds(workspace.structure),
    requirementCoverage: {
      covered: coverage.covered.length,
      uncovered: coverage.uncovered.length,
    },
  };
}

export async function exportQualifiedPdf(
  compiler: ElectronResumeCompilerService,
  workspace: ResumeWorkspace,
  sampleId: string,
  iteration: number,
): Promise<void> {
  const artifactDirectory = process.env.COOLTO_RESUME_PERF_ARTIFACT_DIR;
  if (!artifactDirectory) return;
  try {
    const compilation = await compiler.compileForPdf(
      workspace.structure,
      undefined,
      true,
    );
    await writeFile(
      join(
        artifactDirectory,
        `resume-${sampleId}-${String(iteration).padStart(2, "0")}.pdf`,
      ),
      compilation.pdf,
    );
    if (compilation.screenshot) {
      await writeFile(
        join(
          artifactDirectory,
          `resume-${sampleId}-${String(iteration).padStart(2, "0")}.png`,
        ),
        compilation.screenshot,
      );
    }
  } catch (caught: unknown) {
    process.stderr.write(
      `PDF export failed for ${sampleId}#${iteration}: ${
        caught instanceof Error ? caught.message : String(caught)
      }\n`,
    );
  }
}

function round4(value: number): number {
  return Number(value.toFixed(4));
}
