import { onMounted, ref } from "vue";

import { desktopApi } from "../lib/desktop-api";
import {
  isAvailableGeneralResume,
  resolveEmptyStateStage,
  type EmptyStateStage,
} from "./empty-state-stage";

export type { EmptyStateStage } from "./empty-state-stage";

export function useEmptyStateStages() {
  const stage = ref<EmptyStateStage>("experience_intake");

  onMounted(async () => {
    try {
      const [experiences, references, applications, resumes, deliveryFiles] = await Promise.all([
        desktopApi.experiences.search({ status: "active", limit: 500 }),
        desktopApi.applications.references(),
        desktopApi.applications.list({ limit: 500 }),
        desktopApi.library.list(),
        desktopApi.deliveryResumeFiles.list(),
      ]);
      stage.value = resolveEmptyStateStage({
        experienceCount: experiences.items.length,
        generalResumeCount: resumes.filter(isAvailableGeneralResume).length,
        deliveryResumeFileCount: deliveryFiles.length,
        jdCount: references.jds.length,
        applicationCount: applications.items.length,
      });
    } catch {
      stage.value = "experience_intake";
    }
  });

  return { stage };
}
