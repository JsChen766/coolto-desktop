export interface SyncDestroyTarget {
  stopWorker(): Promise<void>;
  closeStore(): void;
  clearStoreReference(): void;
  removeDirectory(): Promise<void>;
}

export async function destroyLocalSyncState(target: SyncDestroyTarget): Promise<void> {
  await target.stopWorker();
  target.closeStore();
  target.clearStoreReference();
  await target.removeDirectory();
}
