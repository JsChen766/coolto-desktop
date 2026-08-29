import { onMounted, ref } from "vue";

import type { JobRepositorySnapshot } from "@desktop/types";
import { desktopApi } from "../lib/desktop-api";
import { translate } from "../i18n/locale";

export function useJobRepository() {
  const snapshot = ref<JobRepositorySnapshot>({
    jds: [], resumes: [], deliveryResumeFiles: [],
  });
  const loading = ref(false);
  const error = ref<string>();

  async function load(): Promise<void> {
    loading.value = true;
    error.value = undefined;
    try {
      snapshot.value = await desktopApi.jobAssets.get();
    } catch (cause) {
      error.value = translate(cause instanceof Error ? cause.message : "求职仓库加载失败");
    } finally {
      loading.value = false;
    }
  }

  onMounted(load);
  return { snapshot, loading, error, load };
}
