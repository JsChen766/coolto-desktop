<script setup lang="ts">
import type { ExperienceDetail, ExperienceSyncIssueView } from "@desktop/types";

import { experienceDateRange } from "../../../../experience/timeline-labels";
import { translateDateRange } from "../i18n/locale";

defineProps<{
  issue: ExperienceSyncIssueView;
  busy?: boolean;
  error?: string | undefined;
}>();
defineEmits<{
  close: [];
  action: [value: "accept_server" | "reapply" | "save_as_new"];
}>();

function subtitle(experience: ExperienceDetail): string {
  return [
    experience.organization,
    experience.role,
    translateDateRange(experienceDateRange(experience)),
  ].filter(Boolean).join(" · ");
}
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="$emit('close')">
    <section
      class="dialog-card experience-sync-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="$t('处理经历同步问题')"
    >
      <h2>{{ $t('处理经历同步问题') }}</h2>
      <p>
        {{ issue.status === "conflict"
          ? $t('服务端与本地内容在同一版本之后发生了不同修改。')
          : $t('最近一次写入未通过服务端校验，请选择如何继续。') }}
      </p>
      <span class="experience-sync-error-code">{{ $tf('错误代码：{code}', { code: issue.errorCode }) }}</span>

      <div class="experience-sync-compare">
        <section>
          <h3>{{ $t('本地内容') }}</h3>
          <strong>{{ issue.local.title }}</strong>
          <small>{{ subtitle(issue.local) }}</small>
          <p>{{ issue.local.currentRevision?.content || $t('当前正文不可用') }}</p>
        </section>
        <section>
          <h3>{{ $t('服务端内容') }}</h3>
          <template v-if="issue.server">
            <strong>{{ issue.server.title }}</strong>
            <small>{{ subtitle(issue.server) }}</small>
            <p>{{ issue.server.currentRevision?.content || $t('当前正文不可用') }}</p>
          </template>
          <p v-else class="experience-server-deleted">{{ $t('服务端已删除这条经历。') }}</p>
        </section>
      </div>

      <p v-if="error" class="tracker-dialog-error" role="alert">{{ error }}</p>
      <div class="experience-sync-actions">
        <button class="secondary-button" type="button" :disabled="busy" @click="$emit('close')">
          {{ $t('取消') }}
        </button>
        <button
          class="secondary-button"
          type="button"
          :disabled="busy"
          @click="$emit('action', 'save_as_new')"
        >
          {{ $t('另存为新经历') }}
        </button>
        <button
          v-if="!issue.serverDeleted"
          class="secondary-button"
          type="button"
          :disabled="busy"
          @click="$emit('action', 'reapply')"
        >
          {{ $t('重新应用本地修改') }}
        </button>
        <button
          class="primary-button"
          :class="{ danger: issue.serverDeleted }"
          type="button"
          :disabled="busy"
          @click="$emit('action', 'accept_server')"
        >
          {{ issue.serverDeleted ? $t('接受服务端删除') : $t('接受服务端版本') }}
        </button>
      </div>
    </section>
  </div>
</template>
