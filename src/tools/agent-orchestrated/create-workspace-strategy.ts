import type { ResumeSourceSnapshotBuilder } from
  "../../resume/source-snapshot.js";
import {
  buildAvailableGeneralResumeSnapshot,
  buildAvailableResumeSnapshot,
} from "./available-source-snapshot.js";

export type WorkspaceGenerationStrategy = "tailored" | "general";

export async function buildWorkspaceSource(input: {
  snapshotBuilder: ResumeSourceSnapshotBuilder;
  generationStrategy?: WorkspaceGenerationStrategy;
  jdId?: string;
  experienceIds: readonly string[];
  hasBase: boolean;
}) {
  const generationStrategy = input.generationStrategy ?? "tailored";
  if (generationStrategy === "tailored" && !input.jdId?.trim()) {
    throw new Error("针对性简历必须提供 jdId");
  }
  if (generationStrategy === "general" && input.jdId) {
    throw new Error("通用简历不得绑定 jdId");
  }
  if (generationStrategy === "general" && input.hasBase) {
    throw new Error("通用简历首版必须从经历仓库创建，不能使用 JD 简历基底");
  }
  const result = generationStrategy === "general"
    ? await buildAvailableGeneralResumeSnapshot(
        input.snapshotBuilder,
        input.experienceIds,
      )
    : await buildAvailableResumeSnapshot(
        input.snapshotBuilder,
        input.jdId!,
        input.experienceIds,
      );
  return { generationStrategy, ...result };
}
