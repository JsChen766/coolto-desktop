import { createUuidV7 } from "../../../sync/uuid-v7.js";
import type { InterviewInput, InterviewRound, TrackerChildProposal } from "../../../tracker/child-types.js";
import { interviewWritePayload, localInterview, toInterview } from "./interview-sync-mapping.js";
import { InterviewSyncStore } from "./interview-sync-store.js";
import { TrackerProposalRegistry } from "./tracker-proposal-registry.js";
import { assertUnchanged, previewEntity } from "./tracker-proposal-preview.js";

export class InterviewProposalService {
  readonly #registry = new TrackerProposalRegistry<InterviewRound>();
  public constructor(private readonly store: InterviewSyncStore) {}

  public async prepareCreate(
    applicationId: string,
    input: InterviewInput,
  ): Promise<TrackerChildProposal<InterviewRound>> {
    const id = createUuidV7();
    const now = new Date().toISOString();
    const next = toInterview(previewEntity("interview_round", id,
      localInterview(id, applicationId, input, now), now));
    return this.#add("create", applicationId, null, next,
      () => this.store.create(applicationId, input, id));
  }

  public async prepareUpdate(
    id: string,
    input: InterviewInput,
  ): Promise<TrackerChildProposal<InterviewRound>> {
    const current = await this.store.get(id);
    const now = new Date().toISOString();
    const next = toInterview(previewEntity("interview_round", id,
      localInterview(id, current.applicationId, input, now, current), now));
    return this.#add("update", current.applicationId, current, next, async () => {
      assertUnchanged(current, await this.store.get(id));
      return this.store.update(id, input);
    });
  }

  public async prepareDelete(id: string): Promise<TrackerChildProposal<InterviewRound>> {
    const current = await this.store.get(id);
    return this.#add("delete", current.applicationId, current, null, async () => {
      assertUnchanged(current, await this.store.get(id));
      return this.store.delete(id);
    });
  }

  public execute(id: string) { return this.#registry.execute(id); }

  #add(
    mutation: TrackerChildProposal<InterviewRound>["mutation"], applicationId: string,
    current: InterviewRound | null, next: InterviewRound | null,
    execute: () => ReturnType<InterviewSyncStore["create"]> | ReturnType<InterviewSyncStore["delete"]>,
  ) {
    return this.#registry.add({ id: createUuidV7(), entityKind: "interview", mutation,
      applicationId, current, next, preparedAt: new Date().toISOString() }, execute);
  }
}

