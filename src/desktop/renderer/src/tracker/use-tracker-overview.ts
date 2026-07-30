import { ref } from "vue";
import type { ApplicationTrackerDetail } from "@desktop/types";
import { desktopApi } from "../lib/desktop-api";

export function useTrackerOverview() {
  const snapshot = ref<ApplicationTrackerDetail>({
    statusEvents: [], interviews: [], notes: [], reminders: [],
  });
  const error = ref<string>();
  async function load(): Promise<void> {
    try {
      snapshot.value = await desktopApi.tracker.overview();
      error.value = undefined;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : "读取 Tracker 日程失败";
    }
  }
  return { error, load, snapshot };
}
