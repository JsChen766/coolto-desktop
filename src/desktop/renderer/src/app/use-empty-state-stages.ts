import { onMounted, ref } from "vue";

import { desktopApi } from "../lib/desktop-api";

export type EmptyStateStage = 1 | 2 | 3 | 4;

export function useEmptyStateStages() {
  const stage = ref<EmptyStateStage>(1);

  onMounted(async () => {
    try {
      const [experiences, references, applications] = await Promise.all([
        desktopApi.experiences.search({ status: "active", limit: 500 }),
        desktopApi.applications.references(),
        desktopApi.applications.list({ limit: 500 }),
      ]);
      const experienceCount = experiences.items.length;
      const jdCount = references.jds.length;
      const applicationCount = applications.items.length;
      if (experienceCount === 0) stage.value = 1;
      else if (jdCount === 0) stage.value = 2;
      else if (applicationCount === 0) stage.value = 3;
      else stage.value = 4;
    } catch {
      stage.value = 1;
    }
  });

  return { stage };
}
