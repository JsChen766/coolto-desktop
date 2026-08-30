import { computed, ref, type Ref } from "vue";

import type { JobRepositorySnapshot } from "@desktop/types";
import { desktopErrorMessage } from "../chat/desktop-error-message";
import { desktopApi } from "../lib/desktop-api";
import {
  filterDeliveryResumeFiles,
  type RepositoryView,
  type ResumeFilter,
} from "./job-repository-filter";

export function useDeliveryResumeFiles(input: {
  snapshot: Ref<JobRepositorySnapshot>;
  selectedEntryId: Ref<string | null>;
  view: Ref<RepositoryView>;
  query: Ref<string>;
  resumeFilter: Ref<ResumeFilter>;
  hasRegularResumeResults(): boolean;
  load(): Promise<void>;
  setError(value: string | undefined): void;
  closeDetail(): void;
  openDetail(): void;
}) {
  const busy = ref(false);
  const filtered = computed(() => filterDeliveryResumeFiles(
    input.snapshot.value.deliveryResumeFiles,
    input.query.value,
    input.resumeFilter.value,
  ));
  const selected = computed(() => filtered.value.find(
    (file) => entryId(file.id) === input.selectedEntryId.value,
  ) ?? (!input.hasRegularResumeResults() ? filtered.value[0] : undefined));

  function select(id: string): void {
    input.selectedEntryId.value = id;
  }

  async function importFile(): Promise<void> {
    await run(async () => {
      const imported = await desktopApi.deliveryResumeFiles.importFile();
      if (!imported) return;
      await input.load();
      input.view.value = "resumes";
      input.resumeFilter.value = "";
      input.query.value = "";
      select(entryId(imported.id));
      input.openDetail();
    });
  }

  async function rename(title: string): Promise<void> {
    const file = selected.value;
    if (!file) return;
    await run(async () => {
      await desktopApi.deliveryResumeFiles.rename({ fileId: file.id, title });
      await input.load();
    });
  }

  async function remove(): Promise<void> {
    const file = selected.value;
    if (!file) return;
    await run(async () => {
      await desktopApi.deliveryResumeFiles.delete({ fileId: file.id });
      input.selectedEntryId.value = null;
      input.closeDetail();
      await input.load();
    });
  }

  async function run(action: () => Promise<void>): Promise<void> {
    if (busy.value) return;
    busy.value = true;
    input.setError(undefined);
    try {
      await action();
    } catch (error: unknown) {
      input.setError(desktopErrorMessage(error));
    } finally {
      busy.value = false;
    }
  }

  return { busy, filtered, selected, select, importFile, rename, remove };
}

export function deliveryResumeFileEntryId(fileId: string): string {
  return entryId(fileId);
}

function entryId(fileId: string): string {
  return `delivery:${fileId}`;
}
