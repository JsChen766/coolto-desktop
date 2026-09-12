<script setup lang="ts">
import { AlertTriangle, CloudOff, LoaderCircle } from "@lucide/vue";
import { computed } from "vue";

const props = defineProps<{
  status: "pending" | "conflict" | "failed";
  busy?: boolean;
}>();
const emit = defineEmits<{ acceptServer: [] }>();

const icon = computed(() => {
  if (props.status === "pending") return LoaderCircle;
  if (props.status === "conflict") return AlertTriangle;
  return CloudOff;
});

const title = computed(() => {
  if (props.status === "pending") return "正在同步";
  if (props.status === "conflict") return "版本冲突";
  return "同步未完成";
});

const detail = computed(() => {
  if (props.status === "pending") return "已保存到本机，等待写入云端";
  if (props.status === "conflict") return "本机与服务端不一致，可重新保存或";
  return "上次提交未成功，可重新保存或";
});

const showAccept = computed(() => props.status === "conflict" || props.status === "failed");
</script>

<template>
  <section class="profile-sync-banner" :class="status" role="status" aria-live="polite">
    <component :is="icon" class="profile-sync-banner-icon" :size="14" :stroke-width="1.8" aria-hidden="true" />
    <strong class="profile-sync-banner-title">{{ $t(title) }}</strong>
    <span class="profile-sync-banner-sep" aria-hidden="true">·</span>
    <span class="profile-sync-banner-detail">{{ $t(detail) }}</span>
    <button
      v-if="showAccept"
      class="profile-sync-banner-link"
      type="button"
      :disabled="busy"
      @click="emit('acceptServer')"
    >
      {{ $t('使用服务端版本') }}
    </button>
  </section>
</template>
