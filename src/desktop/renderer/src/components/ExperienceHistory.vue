<script setup lang="ts">
import { History } from "@lucide/vue";

import type { ExperienceDetail, ExperienceRevision } from "@desktop/types";
import {
  restoreDisabledReason,
} from "../../../../experience/history-model";
import { useExperienceHistory } from "../experiences/use-experience-history";
import ExperienceRevisionItem from "./ExperienceRevisionItem.vue";

const props = defineProps<{ experience: ExperienceDetail; busy?: boolean }>();
const emit = defineEmits<{ restore: [revision: ExperienceRevision] }>();
const history = useExperienceHistory(() => props.experience);
</script>

<template>
  <section class="experience-detail-section experience-history">
    <header class="experience-history-heading">
      <div>
        <History :size="15" :stroke-width="1.8" aria-hidden="true" />
        <h3>版本记录</h3>
      </div>
      <button
        type="button"
        :aria-expanded="history.open.value"
        @click="history.toggle"
      >
        {{ history.open.value ? "收起记录" : "查看版本记录" }}
      </button>
    </header>

    <div v-if="history.open.value" class="experience-history-list">
      <div v-if="history.loading.value" class="experience-history-state">
        正在读取版本记录…
      </div>
      <template v-else>
        <ExperienceRevisionItem
          v-if="history.pending.value"
          :revision="history.pending.value"
          label="本机待同步版本"
          pending
        />
        <p v-if="history.error.value" class="experience-history-error" role="status">
          {{ history.error.value }}
          <button type="button" @click="history.load(false)">重试</button>
        </p>
        <ExperienceRevisionItem
          v-for="(revision, index) in history.items.value"
          :key="revision.id"
          :revision="revision"
          :label="index === 0
            ? (history.pending.value ? '最近已同步版本' : '当前版本')
            : undefined"
          :restore-disabled="busy
            ? '正在处理'
            : restoreDisabledReason(experience, revision)"
          @restore="emit('restore', $event)"
        />
        <p
          v-if="!history.error.value && !history.pending.value && !history.items.value.length"
          class="experience-history-state"
        >
          暂无可显示的版本记录。
        </p>
        <button
          v-if="history.nextCursor.value"
          class="experience-history-more"
          type="button"
          :disabled="history.loadingMore.value"
          @click="history.load(true)"
        >
          {{ history.loadingMore.value ? "正在加载…" : "加载更早版本" }}
        </button>
      </template>
    </div>
  </section>
</template>
