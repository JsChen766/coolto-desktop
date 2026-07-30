import { createUuidV7 } from "../../../sync/uuid-v7.js";
import type { Reminder, ReminderInput, TrackerChildProposal } from "../../../tracker/child-types.js";
import { localReminder, toReminder } from "./reminder-sync-mapping.js";
import { ReminderSyncStore } from "./reminder-sync-store.js";
import { TrackerProposalRegistry } from "./tracker-proposal-registry.js";
import { assertUnchanged, previewEntity } from "./tracker-proposal-preview.js";

export class ReminderProposalService {
  readonly #registry = new TrackerProposalRegistry<Reminder>();
  public constructor(private readonly store: ReminderSyncStore) {}

  public async prepareCreate(applicationId: string, input: ReminderInput) {
    const id = createUuidV7();
    const now = new Date().toISOString();
    const next = toReminder(previewEntity("reminder", id,
      localReminder(id, applicationId, input, now), now));
    return this.#add("create", applicationId, null, next,
      () => this.store.create(applicationId, input, id));
  }

  public async prepareUpdate(id: string, input: ReminderInput) {
    const current = await this.store.get(id);
    const now = new Date().toISOString();
    const next = toReminder(previewEntity("reminder", id,
      localReminder(id, current.applicationId, input, now, current), now));
    return this.#add("update", current.applicationId, current, next, async () => {
      assertUnchanged(current, await this.store.get(id));
      return this.store.update(id, input);
    });
  }

  public async prepareDelete(id: string) {
    const current = await this.store.get(id);
    return this.#add("delete", current.applicationId, current, null, async () => {
      assertUnchanged(current, await this.store.get(id));
      return this.store.delete(id);
    });
  }

  public execute(id: string) { return this.#registry.execute(id); }

  #add(
    mutation: TrackerChildProposal<Reminder>["mutation"], applicationId: string,
    current: Reminder | null, next: Reminder | null,
    execute: () => ReturnType<ReminderSyncStore["create"]> | ReturnType<ReminderSyncStore["delete"]>,
  ) {
    return this.#registry.add({ id: createUuidV7(), entityKind: "reminder", mutation,
      applicationId, current, next, preparedAt: new Date().toISOString() }, execute);
  }
}
