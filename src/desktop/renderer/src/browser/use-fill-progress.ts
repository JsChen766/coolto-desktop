import { computed, ref } from "vue";

import type { BrowserFillRecordView } from "@desktop/types";
import { desktopApi } from "../lib/desktop-api";

/**
 * B4: 订阅浏览器填写/审核相关的 IPC 事件，维护面向渲染进程的响应式视图。
 * - records: 当前一批写入的字段列表（含 pending/accepted/rejected 状态）
 * - reviewing: 是否已进入 Overlay 审核期
 * - lastOutcome: 最近一次审核结果（用于聊天面板卡片展示"已接受 X / 拒绝 Y"）
 * - captcha: 最近一次验证码提示（用户手动通过后可主动 clear）
 */
export function useFillProgress() {
  const records = ref<BrowserFillRecordView[]>([]);
  const reviewing = ref(false);
  const lastOutcome = ref<{
    action: "accepted" | "rejected" | "mixed";
    acceptedCount: number;
    rejectedCount: number;
    at: string;
  }>();
  const captcha = ref<{ kind: string; detail?: string; at: string }>();

  const hasRecords = computed(() => records.value.length > 0);
  const pendingCount = computed(
    () => records.value.filter((r) => r.decision === "pending").length,
  );
  const acceptedCount = computed(
    () => records.value.filter((r) => r.decision === "accepted").length,
  );
  const rejectedCount = computed(
    () => records.value.filter((r) => r.decision === "rejected").length,
  );

  const unsubs: Array<() => void> = [];

  function mount(): void {
    unsubs.push(
      desktopApi.browser.onFillProgress((payload) => {
        records.value = payload.records;
        reviewing.value = payload.reviewing;
        if (!payload.reviewing && payload.records.length === 0) {
          // 完成 or 收回：清空当前视图，保留 lastOutcome 供卡片展示
          records.value = [];
        }
      }),
    );
    unsubs.push(
      desktopApi.browser.onReviewDecision((payload) => {
        const record = records.value.find((r) => r.fillId === payload.fillId);
        if (record) record.decision = payload.decision;
      }),
    );
    unsubs.push(
      desktopApi.browser.onReviewComplete((payload) => {
        lastOutcome.value = {
          action: payload.action,
          acceptedCount: payload.acceptedCount,
          rejectedCount: payload.rejectedCount,
          at: new Date().toISOString(),
        };
      }),
    );
    unsubs.push(
      desktopApi.browser.onCaptchaDetected((payload) => {
        captcha.value = {
          kind: payload.kind,
          ...(payload.detail !== undefined ? { detail: payload.detail } : {}),
          at: new Date().toISOString(),
        };
      }),
    );
  }

  function unmount(): void {
    for (const u of unsubs.splice(0)) u();
  }

  async function abortFill(): Promise<void> {
    await desktopApi.browser.abortFill();
  }

  function dismissCaptcha(): void {
    captcha.value = undefined;
  }

  function dismissOutcome(): void {
    lastOutcome.value = undefined;
  }

  return {
    records,
    reviewing,
    lastOutcome,
    captcha,
    hasRecords,
    pendingCount,
    acceptedCount,
    rejectedCount,
    mount,
    unmount,
    abortFill,
    dismissCaptcha,
    dismissOutcome,
  };
}

export type UseFillProgress = ReturnType<typeof useFillProgress>;
