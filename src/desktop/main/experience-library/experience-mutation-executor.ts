import type { ExperienceExecutionResult } from "../../../experience/maintenance-types.js";
import type { EnqueueMutation } from "../sync/local-sync-types.js";
import type { LocalSyncStore } from "../sync/local-sync-store.js";
import { toExperienceDetail } from "./experience-sync-mapping.js";

export type ExperienceExecution =
  | { mode: "enqueue"; mutation: EnqueueMutation }
  | { mode: "replace_blocked"; mutation: EnqueueMutation }
  | {
      mode: "save_as_new";
      sourceExperienceId: string;
      mutation: EnqueueMutation;
    }
  | { mode: "accept_server"; experienceId: string };

export class ExperienceMutationExecutor {
  public constructor(
    private readonly local: LocalSyncStore,
    private readonly trigger: () => void,
  ) {}

  public execute(execution: ExperienceExecution): ExperienceExecutionResult {
    if (execution.mode === "accept_server") {
      this.local.acceptServer("experience", execution.experienceId);
      const resolved = this.local.getEntity("experience", execution.experienceId);
      return {
        experience: resolved ? toExperienceDetail(resolved) : null,
        removedLocal: !resolved,
      };
    }
    if (execution.mode === "save_as_new") {
      this.local.saveBlockedAsNew(
        "experience",
        execution.sourceExperienceId,
        execution.mutation,
      );
    } else if (execution.mode === "replace_blocked") {
      this.local.replaceBlocked(execution.mutation);
    } else {
      this.local.enqueue(execution.mutation);
    }
    this.trigger();
    const entity = this.local.getEntity(
      "experience",
      execution.mutation.entityId,
    );
    if (!entity) throw new Error("经历本地写入失败");
    return { experience: toExperienceDetail(entity), removedLocal: false };
  }
}
