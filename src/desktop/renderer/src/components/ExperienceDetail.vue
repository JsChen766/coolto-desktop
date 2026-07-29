<script setup lang="ts">
import { ArrowLeft, MapPin } from "@lucide/vue";

import type { ExperienceDetail } from "@desktop/types";
import {
  EXPERIENCE_CATEGORY_LABELS,
  EXPERIENCE_SYNC_LABELS,
  experienceDateRange,
} from "../../../../experience/timeline-labels";

defineProps<{ experience: ExperienceDetail }>();
defineEmits<{ back: [] }>();
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
        <ArrowLeft :size="16" aria-hidden="true" />返回经历列表
      </button>
      <div class="experience-detail-title">
        <h2>{{ experience.title }}</h2>
        <p>
          <span>{{ EXPERIENCE_CATEGORY_LABELS[experience.category] }}</span>
          <span v-if="experience.status === 'archived'">已归档</span>
        </p>
      </div>
    </header>

    <div class="experience-detail-scroll">
      <div
        v-if="experience.syncStatus && experience.syncStatus !== 'clean'"
        class="experience-sync-notice"
        :class="experience.syncStatus"
        role="status"
      >
        <strong>{{ EXPERIENCE_SYNC_LABELS[experience.syncStatus] }}</strong>
        <span v-if="experience.syncStatus === 'pending'">这条经历已保存在本机，正在等待同步。</span>
        <span v-else-if="experience.syncStatus === 'conflict'">
          服务端与本地内容存在冲突，E3 将提供处理入口。
        </span>
        <span v-else>最近一次同步未能写入，E3 将提供处理入口。</span>
      </div>

      <dl class="experience-facts">
        <div>
          <dt>时间</dt>
          <dd>{{ experienceDateRange(experience) }}</dd>
        </div>
        <div v-if="experience.organization">
          <dt>组织</dt>
          <dd>{{ experience.organization }}</dd>
        </div>
        <div v-if="experience.role">
          <dt>角色</dt>
          <dd>{{ experience.role }}</dd>
        </div>
        <div v-if="experience.location">
          <dt>地点</dt>
          <dd><MapPin :size="13" aria-hidden="true" />{{ experience.location }}</dd>
        </div>
      </dl>

      <section v-if="experience.tags.length" class="experience-detail-section">
        <h3>标签</h3>
        <div class="experience-detail-tags">
          <span v-for="tag in experience.tags" :key="tag">{{ tag }}</span>
        </div>
      </section>

      <section class="experience-detail-section experience-content">
        <h3>经历内容</h3>
        <p v-if="experience.currentRevision?.content">
          {{ experience.currentRevision.content }}
        </p>
        <p v-else class="experience-content-missing">当前内容不可用。</p>
      </section>
    </div>
  </article>
</template>
