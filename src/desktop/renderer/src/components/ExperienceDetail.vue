<script setup lang="ts">
import { ArrowLeft, Ellipsis, MapPin, Pencil } from "@lucide/vue";
import { onBeforeUnmount, onMounted, ref } from "vue";

import type { ExperienceDetail, ExperienceRevision } from "@desktop/types";
import {
  EXPERIENCE_CATEGORY_LABELS,
  EXPERIENCE_SYNC_LABELS,
  experienceDateRange,
} from "../../../../experience/timeline-labels";
import { translateDateRange } from "../i18n/locale";
import ExperienceHistory from "./ExperienceHistory.vue";
import { stripMaterialMarkers } from "../../../../experience/material-content";

defineProps<{ experience: ExperienceDetail; busy?: boolean }>();
const emit = defineEmits<{
  action: [value: "archive" | "restore" | "delete"];
  back: [];
  edit: [];
  restoreRevision: [revision: ExperienceRevision];
  resolveSync: [];
}>();
const menuOpen = ref(false);
const editable = (experience: ExperienceDetail) =>
  experience.syncStatus !== "conflict" && experience.syncStatus !== "failed";

function action(value: "archive" | "restore" | "delete"): void {
  menuOpen.value = false;
  emit("action", value);
}

onMounted(() => window.addEventListener("click", closeMenu));
onBeforeUnmount(() => window.removeEventListener("click", closeMenu));
function closeMenu(): void {
  menuOpen.value = false;
}
</script>

<template>
  <article
    class="experience-detail"
    :class="{ archived: experience.status === 'archived' }"
  >
    <header class="experience-detail-header">
      <button
        class="experience-detail-back"
        type="button"
        @click="$emit('back')"
      >
        <ArrowLeft :size="16" aria-hidden="true" />{{ $t('返回经历列表') }}
      </button>
      <div class="experience-detail-title">
        <h2>{{ experience.title }}</h2>
        <p>
          <span>{{ $t(EXPERIENCE_CATEGORY_LABELS[experience.category]) }}</span>
          <span v-if="experience.status === 'archived'">{{ $t('已归档') }}</span>
        </p>
      </div>
      <div v-if="editable(experience)" class="experience-detail-actions">
        <button
          class="secondary-button icon-label"
          type="button"
          :disabled="busy"
          @click="$emit('edit')"
        >
          <Pencil :size="15" :stroke-width="1.8" aria-hidden="true" />
          {{ $t('编辑') }}
        </button>
        <div class="experience-more-wrap" @click.stop>
          <button
            class="experience-more-trigger"
            type="button"
            :disabled="busy"
            :aria-label="$t('更多经历操作')"
            :title="$t('更多经历操作')"
            @click="menuOpen = !menuOpen"
          >
            <Ellipsis :size="17" :stroke-width="1.8" aria-hidden="true" />
          </button>
          <div v-if="menuOpen" class="popover experience-more-menu">
            <button
              type="button"
              @click="action(experience.status === 'archived' ? 'restore' : 'archive')"
            >
              {{ experience.status === "archived" ? $t('恢复') : $t('归档') }}
            </button>
            <button class="destructive" type="button" @click="action('delete')">
              {{ $t('删除') }}
            </button>
          </div>
        </div>
      </div>
    </header>

    <div class="experience-detail-scroll">
      <div
        v-if="experience.syncStatus && experience.syncStatus !== 'clean'"
        class="experience-sync-notice"
        :class="experience.syncStatus"
        role="status"
      >
        <strong>{{ $t(EXPERIENCE_SYNC_LABELS[experience.syncStatus]) }}</strong>
        <span v-if="experience.syncStatus === 'pending'">{{ $t('这条经历已保存在本机，正在等待同步。') }}</span>
        <span v-else-if="experience.syncStatus === 'conflict'">
          {{ $t('服务端与本地内容存在冲突，需要先处理后才能继续编辑。') }}
        </span>
        <span v-else>{{ $t('最近一次同步未能写入，需要先处理后才能继续编辑。') }}</span>
        <button
          v-if="experience.syncStatus === 'conflict' || experience.syncStatus === 'failed'"
          type="button"
          :disabled="busy"
          @click="$emit('resolveSync')"
        >
          {{ $t('处理同步问题') }}
        </button>
      </div>

      <dl class="experience-facts">
        <div>
          <dt>{{ $t('时间') }}</dt>
          <dd>{{ translateDateRange(experienceDateRange(experience)) }}</dd>
        </div>
        <div v-if="experience.organization">
          <dt>{{ $t('组织') }}</dt>
          <dd>{{ experience.organization }}</dd>
        </div>
        <div v-if="experience.role">
          <dt>{{ $t('角色') }}</dt>
          <dd>{{ experience.role }}</dd>
        </div>
        <div v-if="experience.location">
          <dt>{{ $t('地点') }}</dt>
          <dd><MapPin :size="13" aria-hidden="true" />{{ experience.location }}</dd>
        </div>
      </dl>

      <section v-if="experience.tags.length" class="experience-detail-section">
        <h3>{{ $t('标签') }}</h3>
        <div class="experience-detail-tags">
          <span v-for="tag in experience.tags" :key="tag">{{ tag }}</span>
        </div>
      </section>

      <section class="experience-detail-section experience-content">
        <h3>{{ $t('经历内容') }}</h3>
        <p v-if="experience.currentRevision?.content">
          {{ stripMaterialMarkers(experience.currentRevision.content) }}
        </p>
        <p v-else class="experience-content-missing">{{ $t('当前内容不可用。') }}</p>
      </section>

      <ExperienceHistory
        :experience="experience"
        :busy="busy"
        @restore="$emit('restoreRevision', $event)"
      />
    </div>
  </article>
</template>
