<script setup lang="ts">
import { LockKeyhole, MessageSquareText } from "@lucide/vue";
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

import type {
  ResumeChatReference,
  ResumeDraftDetail,
  ResumeDraftEditInput,
} from "@desktop/types";
import { renderResume } from "../resume-renderer/render-dom";
import {
  requireResumeTemplate,
  resolveResumeTemplate,
} from "../resume-renderer/template";

const props = defineProps<{
  draft: ResumeDraftDetail;
}>();

const emit = defineEmits<{
  edit: [input: ResumeDraftEditInput];
  autosave: [input: ResumeDraftEditInput];
  requestChatEdit: [reference: ResumeChatReference];
}>();

const viewport = ref<HTMLElement>();
const resumeRoot = ref<HTMLElement>();
const scale = ref(1);
const pageSize = ref({ width: 794, height: 1123 });
const locked = ref<{
  left: number;
  top: number;
  reference: ResumeChatReference;
}>();
let resizeObserver: ResizeObserver | undefined;
const autosaveTimers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();

watch(
  () => props.draft,
  () => void draw(),
  { deep: true },
);

onMounted(() => {
  resizeObserver = new ResizeObserver(updateScale);
  if (viewport.value) resizeObserver.observe(viewport.value);
  void draw();
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  autosaveTimers.forEach(clearTimeout);
  autosaveTimers.clear();
});

async function draw(): Promise<void> {
  const root = resumeRoot.value;
  if (!root) return;
  const template =
    resolveResumeTemplate(props.draft.structure) ??
    requireResumeTemplate("resume-standard");
  renderResume(root, props.draft.structure, template);
  await nextTick();
  decorateEditableFields(root);
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

function decorateEditableFields(root: HTMLElement): void {
  const changed = new Set(
    props.draft.pendingChange?.changedBulletIds ?? [],
  );
  root.querySelectorAll<HTMLElement>("[data-bullet-id]").forEach((bullet) => {
    const bulletId = bullet.dataset.bulletId;
    const text = bullet.querySelector<HTMLElement>(
      ".resume-document-bullet-text",
    );
    const marker = bullet.querySelector<HTMLElement>(
      ".resume-document-bullet-marker",
    );
    if (!bulletId || !text || !marker) return;
    makeEditable(text, { type: "bullet", bulletId });
    if (changed.has(bulletId)) markChangedText(text);
    makeDraggable(marker, {
      artifactId: props.draft.artifactId,
      targetType: "bullet",
      targetId: bulletId,
      label: text.innerText.trim().slice(0, 64),
    });
  });
  root.querySelectorAll<HTMLElement>("[data-item-id]").forEach((item) => {
    const itemId = item.dataset.itemId;
    if (!itemId) return;
    const primary = item.querySelector<HTMLElement>(
      ".resume-document-entry-primary",
    );
    if (primary) {
      makeDraggable(primary, {
        artifactId: props.draft.artifactId,
        targetType: "item",
        targetId: itemId,
        label: primary.innerText.trim().slice(0, 64),
      });
    }
    const rawText = item.querySelector<HTMLElement>(
      ".resume-document-richtext:not(.resume-document-bullet-text)",
    );
    if (rawText) makeEditable(rawText, { type: "raw_text", itemId });
  });
  const lockedSelectors = [
    ".resume-document-name",
    ".resume-document-contact > *",
    ".resume-document-section-heading",
    ".resume-document-entry-primary",
    ".resume-document-entry-secondary",
    ".resume-document-entry-side",
  ].join(",");
  root.querySelectorAll<HTMLElement>(lockedSelectors).forEach(makeLocked);
}

function markChangedText(element: HTMLElement): void {
  const highlight = document.createElement("span");
  highlight.className = "resume-change-highlight";
  while (element.firstChild) highlight.append(element.firstChild);
  element.append(highlight);
}

function makeEditable(
  element: HTMLElement,
  target: ResumeDraftEditInput["target"],
): void {
  element.contentEditable = props.draft.pendingChange ? "false" : "true";
  element.spellcheck = true;
  element.dataset.originalText = element.innerText.trim();
  element.classList.add("resume-editable-text");
  element.addEventListener("input", () => {
    const previous = autosaveTimers.get(element);
    if (previous) clearTimeout(previous);
    autosaveTimers.set(
      element,
      setTimeout(() => {
        autosaveTimers.delete(element);
        emitChangedText(element, target, false);
      }, 900),
    );
  });
  element.addEventListener("blur", () => {
    const pending = autosaveTimers.get(element);
    if (pending) clearTimeout(pending);
    autosaveTimers.delete(element);
    emitChangedText(element, target, true);
  });
  element.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      element.blur();
    }
  });
}

function emitChangedText(
  element: HTMLElement,
  target: ResumeDraftEditInput["target"],
  createCheckpoint: boolean,
): void {
  const text = element.innerText.trim();
  if (!text || text === element.dataset.originalText) return;
  const input: ResumeDraftEditInput = {
    artifactId: props.draft.artifactId,
    target,
    text,
    createCheckpoint,
  };
  if (createCheckpoint) emit("edit", input);
  else emit("autosave", input);
}

function makeDraggable(
  element: HTMLElement,
  reference: ResumeChatReference,
): void {
  element.draggable = true;
  element.classList.add("resume-draggable-source");
  element.title = "拖到聊天区，让 AI 修改";
  element.addEventListener("dragstart", (event) => {
    event.dataTransfer?.setData(
      "application/x-coolto-resume-reference",
      JSON.stringify(reference),
    );
    event.dataTransfer?.setData("text/plain", reference.label);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
  });
}

function makeLocked(element: HTMLElement): void {
  if (element.classList.contains("resume-editable-text")) return;
  element.classList.add("resume-locked-field");
  element.tabIndex = 0;
  element.title = "此内容来自固定资产";
  const show = () => showLockedExplanation(element);
  element.addEventListener("click", show);
  element.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      show();
    }
  });
}

function showLockedExplanation(element: HTMLElement): void {
  const container = viewport.value;
  if (!container) return;
  const containerRect = container.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  const itemId = element.closest<HTMLElement>("[data-item-id]")?.dataset.itemId;
  const sectionId = element.closest<HTMLElement>("[data-section-id]")?.dataset
    .sectionId;
  locked.value = {
    left: Math.max(12, Math.min(container.clientWidth - 264, rect.left - containerRect.left)),
    top: Math.max(12, rect.bottom - containerRect.top + 8),
    reference: {
      artifactId: props.draft.artifactId,
      targetType: "locked_field",
      targetId: itemId ?? sectionId ?? "contact",
      label: element.innerText.trim().slice(0, 64) || "固定信息",
    },
  };
}

function sendLockedToChat(): void {
  if (!locked.value) return;
  emit("requestChatEdit", locked.value.reference);
  locked.value = undefined;
}
</script>

<template>
  <div ref="viewport" class="resume-editor-viewport" @scroll="locked = undefined">
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

    <div
      v-if="locked"
      class="resume-lock-popover"
      :style="{ left: `${locked.left}px`, top: `${locked.top}px` }"
    >
      <div class="resume-lock-title icon-label">
        <LockKeyhole :size="15" :stroke-width="1.8" aria-hidden="true" />
        <strong>固定资产内容</strong>
      </div>
      <p>
        此内容来自个人资料或经历库。为保证 App、Web 与云端一致，不能只在简历中单独修改。
      </p>
      <div class="resume-lock-actions">
        <button type="button" @click="locked = undefined">知道了</button>
        <button class="icon-label" type="button" @click="sendLockedToChat">
          <MessageSquareText :size="14" :stroke-width="1.8" aria-hidden="true" />
          在聊天中修改
        </button>
      </div>
    </div>
  </div>
</template>
