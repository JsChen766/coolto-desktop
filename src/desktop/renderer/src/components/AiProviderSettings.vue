<script setup lang="ts">
import { onMounted, ref } from "vue";

import type { DesktopApi } from "@desktop/types";

const props = defineProps<{ api: DesktopApi }>();
const baseUrl = ref("");
const modelId = ref("");
const apiKey = ref("");
const hasApiKey = ref(false);
const busy = ref(false);
const error = ref<string>();
const saved = ref(false);

onMounted(() => {
  void props.api.aiProvider.get().then((view) => {
    baseUrl.value = view.baseUrl;
    modelId.value = view.modelId;
    hasApiKey.value = view.hasApiKey;
  }).catch((caught: unknown) => {
    error.value = caught instanceof Error ? caught.message : String(caught);
  });
});

async function save(): Promise<void> {
  busy.value = true;
  error.value = undefined;
  saved.value = false;
  try {
    const view = await props.api.aiProvider.save({
      baseUrl: baseUrl.value,
      modelId: modelId.value,
      ...(apiKey.value.trim() ? { apiKey: apiKey.value } : {}),
    });
    hasApiKey.value = view.hasApiKey;
    apiKey.value = "";
    saved.value = true;
  } catch (caught: unknown) {
    error.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <form class="ai-provider-form" @submit.prevent="save">
    <label>
      <span>{{ $t('接口地址') }}</span>
      <input
        v-model="baseUrl"
        type="url"
        name="llm-base-url"
        autocomplete="off"
        spellcheck="false"
        :placeholder="$t('例如 https://api.deepseek.com')"
      >
    </label>
    <label>
      <span>{{ $t('模型名') }}</span>
      <input
        v-model="modelId"
        type="text"
        name="llm-model"
        autocomplete="off"
        spellcheck="false"
        :placeholder="$t('例如 deepseek-chat')"
      >
    </label>
    <label>
      <span>{{ $t('API Key') }}</span>
      <input
        v-model="apiKey"
        type="password"
        name="llm-api-key"
        autocomplete="off"
        :placeholder="hasApiKey ? $t('已保存，留空则保持不变') : $t('不会显示在界面里')"
      >
    </label>
    <p class="settings-pane-lead">
      {{ $t('兼容 OpenAI Chat Completions。Key 只保存在本机系统凭据库，渲染层拿不到明文。') }}
    </p>
    <button class="secondary-button" type="submit" :disabled="busy">
      {{ busy ? $t('正在保存…') : $t('保存 AI 接口') }}
    </button>
    <p v-if="saved" class="settings-usage">{{ $t('已保存，下次对话会使用新配置。') }}</p>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
  </form>
</template>
