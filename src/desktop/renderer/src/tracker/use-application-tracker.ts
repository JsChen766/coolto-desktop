import { ref } from "vue";

import type {
  ApplicationCreateInput,
  ApplicationRecord,
  ApplicationReferenceOptions,
  ApplicationStatus,
  ApplicationUpdateInput,
  ApplicationWriteProposal,
} from "@desktop/types";
import { desktopApi } from "../lib/desktop-api";
import { translate } from "../i18n/locale";

export function useApplicationTracker() {
  const applications = ref<ApplicationRecord[]>([]);
  const references = ref<ApplicationReferenceOptions>({ jds: [], resumes: [] });
  const selected = ref<ApplicationRecord>();
  const loading = ref(false);
  const busy = ref(false);
  const error = ref<string>();

  async function load(): Promise<void> {
    loading.value = true;
    error.value = undefined;
    try {
      const [page, availableReferences] = await Promise.all([
        desktopApi.applications.list(),
        desktopApi.applications.references(),
      ]);
      applications.value = page.items;
      references.value = availableReferences;
      if (selected.value) {
        selected.value = applications.value.find(
          (item) => item.id === selected.value?.id,
        );
      }
    } catch (cause: unknown) {
      error.value = translate(messageOf(cause, "加载投递追踪失败"));
    } finally {
      loading.value = false;
    }
  }

  async function create(input: ApplicationCreateInput): Promise<void> {
    await mutate(() => desktopApi.applications.create(input));
  }

  async function prepareCreate(
    input: ApplicationCreateInput,
  ): Promise<ApplicationWriteProposal> {
    return run(() => desktopApi.applications.prepareCreate(input), "检查投递信息失败");
  }

  async function prepareUpdate(
    id: string,
    changes: ApplicationUpdateInput,
  ): Promise<ApplicationWriteProposal> {
    return run(
      () => desktopApi.applications.prepareUpdate({ applicationId: id, changes }),
      "检查关联纠正失败",
    );
  }

  async function executeProposal(proposalId: string): Promise<ApplicationRecord> {
    return mutate(() => desktopApi.applications.executeProposal(proposalId));
  }

  async function update(id: string, changes: ApplicationUpdateInput): Promise<void> {
    await mutate(() => desktopApi.applications.update({ applicationId: id, changes }));
  }

  async function transition(
    application: ApplicationRecord,
    toStatus: ApplicationStatus,
    reason: string | null,
  ): Promise<void> {
    await mutate(() => desktopApi.applications.transition({
      applicationId: application.id,
      transition: { toStatus, reason },
    }));
  }

  async function remove(application: ApplicationRecord): Promise<void> {
    busy.value = true;
    error.value = undefined;
    try {
      await desktopApi.applications.delete(application.id);
      applications.value = applications.value.filter((item) => item.id !== application.id);
      if (selected.value?.id === application.id) selected.value = undefined;
    } catch (cause: unknown) {
      error.value = translate(messageOf(cause, "删除投递记录失败"));
      throw cause;
    } finally {
      busy.value = false;
    }
  }

  async function mutate(action: () => Promise<ApplicationRecord>): Promise<ApplicationRecord> {
    busy.value = true;
    error.value = undefined;
    try {
      const updated = await action();
      const index = applications.value.findIndex((item) => item.id === updated.id);
      if (index >= 0) applications.value[index] = updated;
      else applications.value.unshift(updated);
      if (selected.value?.id === updated.id) selected.value = updated;
      return updated;
    } catch (cause: unknown) {
      error.value = translate(messageOf(cause, "保存投递记录失败"));
      throw cause;
    } finally {
      busy.value = false;
    }
  }

  async function run<T>(action: () => Promise<T>, fallback: string): Promise<T> {
    busy.value = true;
    error.value = undefined;
    try {
      return await action();
    } catch (cause: unknown) {
      error.value = translate(messageOf(cause, fallback));
      throw cause;
    } finally {
      busy.value = false;
    }
  }

  return {
    applications,
    references,
    selected,
    loading,
    busy,
    error,
    load,
    create,
    prepareCreate,
    prepareUpdate,
    executeProposal,
    update,
    transition,
    remove,
  };
}

function messageOf(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}
