import {
  ResumeSourceSnapshotError,
  type ResumeSourceSnapshotBuilder,
} from "../../resume/source-snapshot.js";
import { STANDARD_RESUME_TEMPLATE_SNAPSHOT } from
  "../../resume/template-contract.js";

/** Rebuilds once per search/read drift, dropping only the exact inactive ID. */
export async function buildAvailableResumeSnapshot(
  snapshotBuilder: ResumeSourceSnapshotBuilder,
  jdId: string,
  experienceIds: readonly string[],
) {
  let availableExperienceIds = [...experienceIds];
  while (availableExperienceIds.length) {
    try {
      const snapshot = await snapshotBuilder.build({
        jdId,
        experienceIds: availableExperienceIds,
        template: STANDARD_RESUME_TEMPLATE_SNAPSHOT,
      });
      return { snapshot, availableExperienceIds };
    } catch (error: unknown) {
      const inactiveId = error instanceof ResumeSourceSnapshotError &&
          error.code === "inactive_experience"
        ? availableExperienceIds.find((id) => error.message.includes(id))
        : undefined;
      if (!inactiveId || availableExperienceIds.length === 1) throw error;
      availableExperienceIds = availableExperienceIds.filter(
        (id) => id !== inactiveId,
      );
    }
  }
  throw new Error("没有可用于简历的 active 经历");
}

/** Rebuilds a general source without ever consulting a JD. */
export async function buildAvailableGeneralResumeSnapshot(
  snapshotBuilder: ResumeSourceSnapshotBuilder,
  experienceIds: readonly string[],
) {
  let availableExperienceIds = [...experienceIds];
  while (availableExperienceIds.length) {
    try {
      const snapshot = await snapshotBuilder.buildGeneral({
        experienceIds: availableExperienceIds,
        template: STANDARD_RESUME_TEMPLATE_SNAPSHOT,
      });
      return { snapshot, availableExperienceIds };
    } catch (error: unknown) {
      const inactiveId = error instanceof ResumeSourceSnapshotError &&
          error.code === "inactive_experience"
        ? availableExperienceIds.find((id) => error.message.includes(id))
        : undefined;
      if (!inactiveId || availableExperienceIds.length === 1) throw error;
      availableExperienceIds = availableExperienceIds.filter(
        (id) => id !== inactiveId,
      );
    }
  }
  throw new Error("没有可用于通用简历的 active 经历");
}
