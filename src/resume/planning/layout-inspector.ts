import type { ResumeSourceSnapshot } from "../source-types.js";
import { ResumeSourceSnapshotBuilder } from "../source-snapshot.js";
import { STANDARD_RESUME_TEMPLATE_SNAPSHOT } from "../template-contract.js";
import { buildResumeSkeleton } from "../workspace/candidate-skeleton.js";
import type { ResumeCompiler } from "../workspace/compiler-port.js";
import {
  buildLayoutContext,
  type LayoutContext,
} from "./layout-context.js";
import { calibrateTypography } from "./typography-calibration.js";

export interface LayoutInspectInput {
  jdId: string;
  experienceIds: string[];
  language: "zh-CN" | "en-US";
}

/**
 * Inspects the layout context for the agent: real Chromium typography,
 * hard line budget and per-experience evidence candidates. Read-only.
 */
export class ResumeLayoutInspector {
  public constructor(
    private readonly snapshotBuilder: ResumeSourceSnapshotBuilder,
    private readonly compiler: ResumeCompiler,
    private readonly maxBulletLines: 2 | 3 = 3,
  ) {}

  public async inspect(input: LayoutInspectInput): Promise<LayoutContext> {
    const snapshot = await this.#buildSnapshot(input);
    const skeleton = buildResumeSkeleton(snapshot, input.experienceIds, input.language);
    const calibration = await calibrateTypography(
      this.compiler,
      skeleton,
      input.language,
    );
    return buildLayoutContext(
      snapshot,
      snapshot.experiences.map((experience) => experience.id),
      calibration.parameters,
      input.language,
      this.maxBulletLines,
    );
  }

  #buildSnapshot(input: LayoutInspectInput): Promise<ResumeSourceSnapshot> {
    return this.snapshotBuilder.build({
      jdId: input.jdId,
      experienceIds: input.experienceIds,
      template: STANDARD_RESUME_TEMPLATE_SNAPSHOT,
    });
  }
}
