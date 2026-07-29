import { computed, onMounted, ref, watch } from "vue";

import type {
  ExperienceCategory,
  ExperienceDetail,
  ExperienceSummary,
} from "@desktop/types";
import { desktopApi } from "../lib/desktop-api";
import {
  filterExperienceCatalog,
  groupExperienceTimeline,
} from "../../../../experience/timeline-model.js";

export function useExperienceLibrary() {
  const catalog = ref<ExperienceSummary[]>([]);
  const query = ref("");
  const category = ref<ExperienceCategory | "">("");
  const status = ref<"active" | "archived">("active");
  const tags = ref<string[]>([]);
  const selectedId = ref<string>();
  const selected = ref<ExperienceDetail>();
  const detailOpen = ref(false);
  const loading = ref(false);
  const detailLoading = ref(false);
  const error = ref<string>();
  let loadVersion = 0;
  let detailVersion = 0;

  const visible = computed(() => filterExperienceCatalog(catalog.value, {
    query: query.value,
    category: category.value,
    tags: tags.value,
  }));
  const groups = computed(() => groupExperienceTimeline(visible.value));
  const availableTags = computed(() => {
    const labels = new Map<string, string>();
    for (const experience of catalog.value) {
      for (const tag of experience.tags) {
        const key = tag.normalize("NFKC").trim().toLowerCase();
        if (key && !labels.has(key)) labels.set(key, tag);
      }
    }
    return [...labels.values()].sort((a, b) => a.localeCompare(b, "zh-CN"));
  });
  const filterCount = computed(
    () => tags.value.length + Number(Boolean(category.value))
      + Number(status.value === "archived"),
  );

  async function load(preferredId = selectedId.value): Promise<void> {
    const version = ++loadVersion;
    loading.value = true;
    error.value = undefined;
    catalog.value = [];
    selected.value = undefined;
    try {
      const result = await desktopApi.experiences.search({
        status: status.value,
        limit: 500,
      });
      if (version !== loadVersion) return;
      catalog.value = result.items;
      ensureSelection(preferredId);
    } catch (cause) {
      if (version === loadVersion) error.value = messageOf(cause, "经历仓库加载失败");
    } finally {
      if (version === loadVersion) loading.value = false;
    }
  }

  async function select(experienceId: string): Promise<void> {
    await loadDetail(experienceId, true);
  }

  async function loadDetail(experienceId: string, open: boolean): Promise<void> {
    const version = ++detailVersion;
    selectedId.value = experienceId;
    if (open) detailOpen.value = true;
    detailLoading.value = true;
    error.value = undefined;
    try {
      const detail = await desktopApi.experiences.get(experienceId);
      if (version === detailVersion) selected.value = detail;
    } catch (cause) {
      if (version === detailVersion) {
        error.value = messageOf(cause, "经历详情加载失败");
      }
    } finally {
      if (version === detailVersion) detailLoading.value = false;
    }
  }

  function ensureSelection(preferredId = selectedId.value): void {
    const first = visible.value[0];
    if (!first) {
      selectedId.value = undefined;
      selected.value = undefined;
      return;
    }
    const preferred = visible.value.find((item) => item.id === preferredId);
    if (!visible.value.some((item) => item.id === selectedId.value)) {
      selectedId.value = preferred?.id ?? first.id;
      void loadDetail(selectedId.value, false);
    }
  }

  function toggleTag(tag: string): void {
    tags.value = tags.value.includes(tag)
      ? tags.value.filter((value) => value !== tag)
      : [...tags.value, tag];
  }

  function clearFilters(): void {
    category.value = "";
    status.value = "active";
    tags.value = [];
  }

  watch(status, () => void load());
  watch(
    () => visible.value.map((item) => item.id).join("\u0000"),
    ensureSelection,
  );
  onMounted(() => void load());

  return {
    availableTags, catalog, category, clearFilters, detailLoading, detailOpen,
    error, filterCount, groups, load, loading, query, select, selected,
    selectedId, status, tags, toggleTag, visible,
  };
}

function messageOf(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}
