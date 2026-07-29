<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

import type { ResumeStructure } from "../../../../resume/types";
import { renderResume } from "../resume-renderer/render-dom";
import {
  requireResumeTemplate,
  resolveResumeTemplate,
} from "../resume-renderer/template";

const props = defineProps<{ structure: ResumeStructure }>();
const viewport = ref<HTMLElement>();
const resumeRoot = ref<HTMLElement>();
const scale = ref(1);
const pageSize = ref({ width: 794, height: 1123 });
let resizeObserver: ResizeObserver | undefined;

watch(() => props.structure, () => void draw(), { deep: true });

onMounted(() => {
  resizeObserver = new ResizeObserver(updateScale);
  if (viewport.value) resizeObserver.observe(viewport.value);
  void draw();
});

onBeforeUnmount(() => resizeObserver?.disconnect());

async function draw(): Promise<void> {
  const root = resumeRoot.value;
  if (!root) return;
  const template =
    resolveResumeTemplate(props.structure) ??
    requireResumeTemplate("resume-standard");
  renderResume(root, props.structure, template);
  await nextTick();
  updateScale();
}

function updateScale(): void {
  const root = resumeRoot.value;
  const container = viewport.value;
  const frame = root?.querySelector<HTMLElement>(".resume-document-frame");
  if (!frame || !container) return;
  const width = frame.offsetWidth || 794;
  const height =
    frame.querySelector<HTMLElement>(".resume-document-page")?.offsetHeight ??
    1123;
  pageSize.value = { width, height };
  scale.value = Math.min(1, Math.max(0.52, (container.clientWidth - 44) / width));
}
</script>

<template>
  <div ref="viewport" class="resume-editor-viewport">
    <div
      class="resume-a4-stage"
      :style="{
        width: `${pageSize.width * scale}px`,
        height: `${pageSize.height * scale}px`,
      }"
    >
      <div
        ref="resumeRoot"
        class="resume-a4-root"
        :style="{ transform: `scale(${scale})` }"
      />
    </div>
  </div>
</template>
