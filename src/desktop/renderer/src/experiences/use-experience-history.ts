import { ref, watch } from "vue";

import type { ExperienceDetail, ExperienceRevision } from "@desktop/types";
import { mergeExperienceRevisions } from "../../../../experience/history-model";
import { desktopApi } from "../lib/desktop-api";
import { translate } from "../i18n/locale";

export function useExperienceHistory(
  experience: () => ExperienceDetail,
) {
  const open = ref(false);
  const items = ref<ExperienceRevision[]>([]);
  const pending = ref<ExperienceRevision>();
  const nextCursor = ref<string>();
  const loading = ref(false);
  const loadingMore = ref(false);
  const error = ref<string>();
  let loadVersion = 0;

  watch(
    () => [
      experience().id,
      experience().currentRevisionId,
      experience().syncStatus,
    ] as const,
    (next, previous) => {
      if (!previous || next[0] !== previous[0]) reset();
      else if (open.value) void load(false);
    },
  );

  function reset(): void {
    loadVersion += 1;
    open.value = false;
    items.value = [];
    pending.value = undefined;
    nextCursor.value = undefined;
    loading.value = false;
    loadingMore.value = false;
    error.value = undefined;
  }

  function toggle(): void {
    open.value = !open.value;
    if (open.value && !items.value.length && !pending.value) void load(false);
  }

  async function load(more: boolean): Promise<void> {
    const version = ++loadVersion;
    more ? loadingMore.value = true : loading.value = true;
    error.value = undefined;
    try {
      const page = await desktopApi.experiences.history({
        experienceId: experience().id,
        ...(more && nextCursor.value ? { cursor: nextCursor.value } : {}),
      });
      if (version !== loadVersion) return;
      if (page.unavailable) {
        if (!more) {
          items.value = [];
          pending.value = page.pendingRevision ?? undefined;
        }
        error.value = translate("历史记录需要联网查看。当前正文与本机待同步版本仍可使用。");
        return;
      }
      items.value = more
        ? mergeExperienceRevisions(items.value, page.items)
        : page.items;
      if (!more) pending.value = page.pendingRevision ?? undefined;
      nextCursor.value = page.nextCursor ?? undefined;
    } catch {
      if (version !== loadVersion) return;
      error.value = translate("历史记录需要联网查看。当前正文与本机待同步版本仍可使用。");
    } finally {
      if (version === loadVersion) {
        loading.value = false;
        loadingMore.value = false;
      }
    }
  }

  return {
    error, items, load, loading, loadingMore, nextCursor, open, pending,
    reset, toggle,
  };
}
