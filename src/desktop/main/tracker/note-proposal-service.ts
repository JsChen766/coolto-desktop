import { createUuidV7 } from "../../../sync/uuid-v7.js";
import type { ApplicationNote, NoteInput, TrackerChildProposal } from "../../../tracker/child-types.js";
import { localNote, toNote } from "./note-sync-mapping.js";
import { NoteSyncStore } from "./note-sync-store.js";
import { TrackerProposalRegistry } from "./tracker-proposal-registry.js";
import { assertUnchanged, previewEntity } from "./tracker-proposal-preview.js";

export class NoteProposalService {
  readonly #registry = new TrackerProposalRegistry<ApplicationNote>();
  public constructor(private readonly store: NoteSyncStore) {}

  public async prepareCreate(applicationId: string, input: NoteInput) {
    const id = createUuidV7();
    const now = new Date().toISOString();
    const next = toNote(previewEntity("application_note", id,
      localNote(id, applicationId, input, now), now));
    return this.#add("create", applicationId, null, next,
      () => this.store.create(applicationId, input, id));
  }

  public async prepareUpdate(id: string, input: NoteInput) {
    const current = await this.store.get(id);
    const now = new Date().toISOString();
    const next = toNote(previewEntity("application_note", id,
      localNote(id, current.applicationId, input, now, current), now));
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
    mutation: TrackerChildProposal<ApplicationNote>["mutation"], applicationId: string,
    current: ApplicationNote | null, next: ApplicationNote | null,
    execute: () => ReturnType<NoteSyncStore["create"]> | ReturnType<NoteSyncStore["delete"]>,
  ) {
    return this.#registry.add({ id: createUuidV7(), entityKind: "note", mutation,
      applicationId, current, next, preparedAt: new Date().toISOString() }, execute);
  }
}

