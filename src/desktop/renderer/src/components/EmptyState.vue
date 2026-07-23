<script setup lang="ts">
import { ArrowRight, FileText, Sparkles } from "@lucide/vue";

defineEmits<{
  usePrompt: [prompt: string];
}>();

const suggestions = [
  {
    icon: FileText,
    title: "整理我的经历",
    prompt: "请读取我的经历，并帮我找出最值得写进简历的内容。",
  },
  {
    icon: Sparkles,
    title: "生成自我介绍",
    prompt: "请根据我的全部经历，写一段简洁有力的自我介绍。",
  },
];
</script>

<template>
  <div class="empty-state">
    <div class="empty-symbol" aria-hidden="true">
      <Sparkles :size="25" :stroke-width="1.55" />
    </div>
    <h1>今天想完成什么？</h1>
    <p>我可以读取你的经历，并帮助你准备求职材料。</p>
    <div class="suggestion-list">
      <button
        v-for="item in suggestions"
        :key="item.title"
        class="suggestion-card"
        type="button"
        @click="$emit('usePrompt', item.prompt)"
      >
        <component
          :is="item.icon"
          :size="16"
          :stroke-width="1.7"
          aria-hidden="true"
        />
        <span>{{ item.title }}</span>
        <ArrowRight
          class="suggestion-arrow"
          :size="15"
          :stroke-width="1.7"
          aria-hidden="true"
        />
      </button>
    </div>
  </div>
</template>
