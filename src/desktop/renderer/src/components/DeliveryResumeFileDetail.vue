<script setup lang="ts">
import { ArrowLeft, Ellipsis, FileText, Send, Star, Trash2 } from "@lucide/vue";
import { ref } from "vue";

import type { DeliveryResumeFile } from "@desktop/types";
import { fileSize } from "../attachments/attachment-formatters";
import { translateFormat } from "../i18n/locale";

const props = defineProps<{ file: DeliveryResumeFile; busy?: boolean }>();
const emit = defineEmits<{
  back: [];
  use: [];
  rename: [title: string];
  delete: [];
}>();
const renaming = ref(false);
const title = ref(props.file.title);

function saveRename(): void {
  const value = title.value.trim();
  if (!value) return;
  emit("rename", value);
  renaming.value = false;
}

function requestDelete(): void {
  if (confirm(translateFormat(
    "删除本机投递文件“{title}”？此操作不会删除或修改其他简历。",
    { title: props.file.title },
  ))) emit("delete");
}
</script>

<template>
  <article class="repository-detail delivery-resume-file-detail">
    <header class="repository-detail-header">
      <button class="repository-detail-back" type="button" @click="$emit('back')">
        <ArrowLeft :size="16" aria-hidden="true" />{{ $t('返回简历列表') }}
      </button>
      <div class="repository-detail-title">
        <div>
          <form v-if="renaming" class="delivery-resume-rename" @submit.prevent="saveRename">
            <input v-model="title" maxlength="240" :aria-label="$t('投递文件名称')" />
            <button type="submit" :disabled="busy">{{ $t('保存') }}</button>
            <button type="button" @click="renaming = false">{{ $t('取消') }}</button>
          </form>
          <template v-else>
            <h2>{{ file.title }}</h2>
            <p>{{ $t('用户源文件 · 仅本机') }}</p>
          </template>
        </div>
        <span class="delivery-resume-source-badge">
          <Star :size="12" fill="currentColor" aria-hidden="true" />{{ $t('原文件') }}
        </span>
      </div>
      <div class="repository-detail-actions">
        <button class="primary-button icon-label" type="button" :disabled="busy" @click="$emit('use')">
          <Send :size="14" aria-hidden="true" />{{ $t('用于投递') }}
        </button>
        <span v-if="file.preferred" class="delivery-resume-preferred">
          <Star :size="13" fill="currentColor" aria-hidden="true" />{{ $t('默认投递文件') }}
        </span>
        <details class="repository-more-actions">
          <summary class="repository-more-trigger" :aria-label="$t('更多投递文件操作')">
            <Ellipsis :size="17" aria-hidden="true" />
          </summary>
          <div class="repository-action-menu">
            <button type="button" @click="title = file.title; renaming = true">{{ $t('重命名') }}</button>
            <button class="danger" type="button" @click="requestDelete">
              <Trash2 :size="13" aria-hidden="true" />{{ $t('删除本机文件') }}
            </button>
          </div>
        </details>
      </div>
    </header>
    <div class="repository-detail-scroll">
      <div class="delivery-resume-rule">
        <FileText :size="17" aria-hidden="true" />
        <p>
          <strong>{{ $t('可用于任何岗位') }}</strong>
          <span>{{ $t('不会判断相关性，也不会参与任何简历生成、修改或复用。') }}</span>
        </p>
      </div>
      <section class="repository-section delivery-resume-metadata">
        <h3>{{ $t('本地文件') }}</h3>
        <dl>
          <div><dt>{{ $t('原文件名') }}</dt><dd>{{ file.originalFilename }}</dd></div>
          <div><dt>{{ $t('格式与大小') }}</dt><dd>{{ file.type.toUpperCase() }} · {{ fileSize(file.sizeBytes) }}</dd></div>
          <div><dt>SHA-256</dt><dd><code>{{ file.sha256.slice(0, 16) }}…</code></dd></div>
        </dl>
      </section>
    </div>
  </article>
</template>
