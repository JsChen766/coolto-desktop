import { ResumeSourceSnapshotBuilder } from "../source-snapshot.js";
import { STANDARD_RESUME_TEMPLATE_SNAPSHOT } from "../template-contract.js";
import type { ResumeSourceSnapshot } from "../source-types.js";

import type { ResumeCompiler } from "../workspace/compiler-port.js";
import { buildResumeSkeleton } from "../workspace/candidate-skeleton.js";
import type { ResumeWorkspace } from "../workspace/types.js";
import { ResumeWorkspaceStore } from "../workspace/workspace-store.js";
import { autoExpandToGate, rankByJdRelevance } from "./auto-expand.js";
import { planResumeWriting, type PlanningParameters, type WritingPlan } from "./planner.js";
import { validateAndPlanLayout } from "./ai-layout.js";
import { calibrateTypography } from "./typography-calibration.js";
import { writeWorkspace } from "./write-workspace.js";
import type { ParallelBulletWriter } from "./parallel-writer.js";
import { appendSkillBullets } from "./skill-bullets.js";

export interface PlannedResumeWriterOptions {
  snapshotBuilder: ResumeSourceSnapshotBuilder;
  compiler: ResumeCompiler;
  store: ResumeWorkspaceStore;
  bulletWriter: ParallelBulletWriter;
  listAdditionalExperiences?: () => Promise<import("../../api/experience-types.js").ExperienceDetail[]>;
  maxBulletLines?: 2 | 3;
}

export interface PlannedResumeWriteInput {
  jdId: string;
  experienceIds: string[];
  language: "zh-CN" | "en-US";
  /** Optional agent-decided layout; validated and executed when provided. */
  layout?: readonly import("./ai-layout.js").AiBulletLayout[];
}

export interface PlannedResumeWriteResult {
  workspace: ResumeWorkspace;
  plan: WritingPlan;
  addedExperienceIds: string[];
  typography: PlanningParameters;
}

/**
 * Host-orchestrated planned resume generation:
 * 1. lock the source snapshot (existing contract);
 * 2. calibrate typography with real Chromium compiles;
 * 3. plan every bullet (evidence + char target);
 * 4. if the material cannot reach the page gate, auto-expand by JD relevance;
 * 5. write all bullets concurrently (one LLM request per bullet);
 * 6. assemble, run the EvidenceLedger and a real compile, then store.
 */
export class PlannedResumeWriter {
  public constructor(private readonly options: PlannedResumeWriterOptions) {}

  public async write(
    input: PlannedResumeWriteInput,
  ): Promise<PlannedResumeWriteResult> {
    const maxBulletLines = this.options.maxBulletLines ?? 3;
    let snapshot = await this.#buildSnapshot(input);
    const skeleton = buildResumeSkeleton(snapshot, input.experienceIds, input.language);
    const typography = await calibrateTypography(
      this.options.compiler,
      skeleton,
      input.language,
    );
    let selectedExperienceIds = [...input.experienceIds];
    let plan = await this.#plan(snapshot, input, typography, maxBulletLines);
    const addedExperienceIds = await this.#expandIfNeeded(
      input,
      snapshot,
      plan,
      typography,
      maxBulletLines,
    );
    if (addedExperienceIds.length) {
      selectedExperienceIds = [...selectedExperienceIds, ...addedExperienceIds];
      snapshot = await this.#buildSnapshot({
        ...input,
        experienceIds: selectedExperienceIds,
      });
      plan = await this.#plan(snapshot, input, typography, maxBulletLines);
    }
    let workspace = await writeWorkspace(this.options,
      { ...input, experienceIds: selectedExperienceIds },
      snapshot,
      plan,
    );
    // Output-driven expansion: when the written page still falls below the
    // gate, add more relevant experiences (by JD relevance) and rewrite
    // instead of leaving the model to struggle. Bounded to avoid loops.
    for (let round = 0; round < 2; round += 1) {
      if (workspace.compileResult.usageRatio >= 0.85) break;
      if (!this.options.listAdditionalExperiences) break;
      const extra = await this.#additionalByRelevance(
        snapshot,
        selectedExperienceIds,
      );
      if (!extra.length) break;
      selectedExperienceIds = [...selectedExperienceIds, ...extra];
      snapshot = await this.#buildSnapshot({
        ...input,
        experienceIds: selectedExperienceIds,
      });
      plan = await this.#plan(snapshot, input, typography, maxBulletLines);
      workspace = await writeWorkspace(this.options,
        { ...input, experienceIds: selectedExperienceIds },
        snapshot,
        plan,
      );
    }
    return { workspace, plan, addedExperienceIds, typography };
  }

  async #additionalByRelevance(
    snapshot: ResumeSourceSnapshot,
    selectedIds: readonly string[],
  ): Promise<string[]> {
    const all = await this.options.listAdditionalExperiences!();
    return rankByJdRelevance(snapshot.jd.requirements, all)
      .filter((experience) => !selectedIds.includes(experience.id))
      .slice(0, 2)
      .map((experience) => experience.id);
  }

  async #plan(
    snapshot: ResumeSourceSnapshot,
    input: PlannedResumeWriteInput,
    typography: PlanningParameters,
    maxBulletLines: 2 | 3,
  ): Promise<WritingPlan> {
    if (input.layout) {
      const validated = validateAndPlanLayout(
        snapshot,
        input.layout,
        typography,
        input.language,
        maxBulletLines,
      );
      if (!validated.ok || !validated.plan) {
        throw new Error(
          `布局计划校验失败：${validated.errors.join("；")}`,
        );
      }
      return validated.plan;
    }
    const base = planResumeWriting(
      snapshot,
      input.experienceIds,
      typography,
      input.language,
      maxBulletLines,
    );
    return appendSkillBullets(base, snapshot, input.experienceIds, typography);
  }

  async #expandIfNeeded(
    input: PlannedResumeWriteInput,
    snapshot: ResumeSourceSnapshot,
    plan: WritingPlan,
    typography: PlanningParameters,
    maxBulletLines: 2 | 3,
  ): Promise<string[]> {
    if (!plan.insufficient || !this.options.listAdditionalExperiences) return [];
    const result = await autoExpandToGate(
      input.experienceIds,
      plan,
      snapshot.jd.requirements,
      {
        listAdditionalExperiences: this.options.listAdditionalExperiences,
        planWith: async (experienceIds) => {
          const next = await this.#buildSnapshot({
            ...input,
            experienceIds: [...experienceIds],
          });
          return {
            snapshot: next,
            plan: planResumeWriting(
              next,
              experienceIds,
              typography,
              input.language,
              maxBulletLines,
            ),
          };
        },
      },
    );
    if (result.exhausted) {
      throw new Error(
        `当前经历的材料不足以生成满足门槛的简历（物理上限 ${Math.round(
          result.plan.estimatedMaxUsageRatio * 100,
        )}%，需 ≥85%），且账号内全部经历均已纳入；请补充约 ${
          result.additionalCharsNeeded
        } 字的新经历内容。`,
      );
    }
    return result.addedExperienceIds;
  }

  #buildSnapshot(input: PlannedResumeWriteInput): Promise<ResumeSourceSnapshot> {
    return this.options.snapshotBuilder.build({
      jdId: input.jdId,
      experienceIds: input.experienceIds,
      template: STANDARD_RESUME_TEMPLATE_SNAPSHOT,
    });
  }
}
