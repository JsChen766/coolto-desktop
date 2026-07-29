import type {
  ExperienceExecutionResult,
  ExperienceProposalKind,
  ExperienceProposalSnapshot,
  ExperienceWriteProposal,
} from "../../../experience/maintenance-types.js";
import { createUuidV7 } from "../../../sync/uuid-v7.js";
import type { LocalEntity } from "../sync/local-sync-types.js";
import type { LocalSyncStore } from "../sync/local-sync-store.js";
import type {
  ExperienceExecution,
  ExperienceMutationExecutor,
} from "./experience-mutation-executor.js";

interface StoredProposal {
  view: ExperienceWriteProposal;
  execution: ExperienceExecution;
}

export class ExperienceProposalRegistry {
  readonly #proposals = new Map<string, StoredProposal>();

  public constructor(
    private readonly local: LocalSyncStore,
    private readonly executor: ExperienceMutationExecutor,
  ) {}

  public add(
    kind: ExperienceProposalKind,
    entity: LocalEntity,
    current: ExperienceProposalSnapshot,
    next: ExperienceProposalSnapshot | null,
    execution: ExperienceExecution,
    errorCode: string | null = null,
  ): ExperienceWriteProposal {
    const view = {
      id: createUuidV7(),
      kind,
      experienceId: entity.entityId,
      expectedEntityVersion: entity.entityVersion,
      expectedLocalVersion: entity.localVersion,
      current,
      next,
      errorCode,
      preparedAt: new Date().toISOString(),
    };
    this.#proposals.set(view.id, { view, execution });
    return structuredClone(view);
  }

  public execute(proposalId: string): ExperienceExecutionResult {
    const stored = this.#proposals.get(proposalId);
    if (!stored) throw new Error("确认内容已失效，请重新检查");
    const current = this.local.getEntity("experience", stored.view.experienceId);
    if (
      !current ||
      current.localVersion !== stored.view.expectedLocalVersion ||
      current.entityVersion !== stored.view.expectedEntityVersion
    ) {
      throw new Error("经历已变化，请重新检查后再确认");
    }
    const result = this.executor.execute(stored.execution);
    this.#proposals.delete(proposalId);
    return result;
  }
}
