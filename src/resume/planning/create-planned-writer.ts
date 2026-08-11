import {
  createDeepSeekDependencies,
  type AgentDependencies,
} from "../../agent/create-agent.js";
import type { ExperienceReader } from "../../api/types.js";
import { ResumeSourceSnapshotBuilder } from "../source-snapshot.js";
import type { ResumeCompiler } from "../workspace/compiler-port.js";
import { ResumeWorkspaceStore } from "../workspace/workspace-store.js";
import { ParallelBulletWriter } from "./parallel-writer.js";
import { PlannedResumeWriter } from "./planned-resume-writer.js";

export interface PlannedWriterDependencies {
  snapshotBuilder: ResumeSourceSnapshotBuilder;
  compiler: ResumeCompiler;
  store: ResumeWorkspaceStore;
  modelId: string;
  experiences: ExperienceReader;
  modelDependencies?: AgentDependencies;
  maxBulletLines?: 2 | 3;
}

/**
 * Shared factory for the host-orchestrated planned resume writer used by both
 * the desktop agent context and the performance QA session.
 */
export function createPlannedResumeWriter(
  dependencies: PlannedWriterDependencies,
): PlannedResumeWriter {
  return new PlannedResumeWriter({
    snapshotBuilder: dependencies.snapshotBuilder,
    compiler: dependencies.compiler,
    store: dependencies.store,
    bulletWriter: new ParallelBulletWriter(
      dependencies.modelDependencies ??
        createDeepSeekDependencies(dependencies.modelId),
    ),
    listAdditionalExperiences: async () => {
      const page = await dependencies.experiences.searchExperiences({
        status: "active",
        limit: 100,
      });
      return Promise.all(
        page.items.map((item) => dependencies.experiences.getExperience(item.id)),
      );
    },
    ...(dependencies.maxBulletLines
      ? { maxBulletLines: dependencies.maxBulletLines }
      : {}),
  });
}
