import { ref } from "vue";

import type { AppUpdateState } from "@desktop/types";
import { desktopApi } from "../lib/desktop-api";

const IDLE_STATE: AppUpdateState = {
  phase: "idle",
  currentVersion: "",
  updateVersion: null,
  percent: null,
  message: null,
  errorStage: null,
};

export function useUpdates() {
  const state = ref<AppUpdateState>({ ...IDLE_STATE });
  const checking = ref(false);
  const upToDateFlash = ref(false);
  let flashTimer: ReturnType<typeof setTimeout> | undefined;

  async function mount(): Promise<() => void> {
    try {
      state.value = await desktopApi.updates.getState();
    } catch {
      state.value = { ...IDLE_STATE };
    }
    return desktopApi.updates.onStateChange((next) => {
      state.value = next;
    });
  }

  function checkSilently(): void {
    void desktopApi.updates.check("silent");
  }

  async function checkManually(): Promise<void> {
    if (checking.value) return;
    checking.value = true;
    upToDateFlash.value = false;
    try {
      await desktopApi.updates.check("manual");
      if (state.value.phase === "idle") flashUpToDate();
    } finally {
      checking.value = false;
    }
  }

  function install(): void {
    void desktopApi.updates.install();
  }

  function flashUpToDate(): void {
    upToDateFlash.value = true;
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      upToDateFlash.value = false;
    }, 4000);
  }

  return {
    state,
    checking,
    upToDateFlash,
    mount,
    checkSilently,
    checkManually,
    install,
  };
}
