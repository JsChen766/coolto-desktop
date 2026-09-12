import type { SyncApi } from "../../../api/sync-api.js";
import { createProfileLocalPayloadMerger } from "../profile/profile-local-sync-adapter.js";
import { LocalSyncStore } from "./local-sync-store.js";
import { SyncWorker } from "./sync-worker.js";
import {
  SyncRuntimeCore,
  type SyncRuntimeDependencies,
  type SyncRuntimeStore,
  type SyncRuntimeWorker,
} from "./sync-runtime-core.js";

export type {
  SyncRuntimeDependencies,
  SyncRuntimeStore,
  SyncRuntimeWorker,
} from "./sync-runtime-core.js";

export class SyncRuntime extends SyncRuntimeCore {
  public constructor(dependencies: Partial<SyncRuntimeDependencies> = {}) {
    super({
      openStore: dependencies.openStore ?? ((apiBaseUrl, userId) =>
        LocalSyncStore.open(apiBaseUrl, userId, createProfileLocalPayloadMerger)),
      createWorker: dependencies.createWorker ??
        ((api, store, deviceId) => new SyncWorker(api, store as LocalSyncStore, deviceId)),
    });
  }

  public override requireStore(): LocalSyncStore {
    return super.requireStore() as LocalSyncStore;
  }

  public override async start(
    apiBaseUrl: string,
    userId: string,
    deviceId: string,
    api: SyncApi,
    networkEnabled = true,
  ): Promise<void> {
    await super.start(apiBaseUrl, userId, deviceId, api, networkEnabled);
  }
}
