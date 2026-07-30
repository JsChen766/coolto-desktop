import { ref } from "vue";
import type { TrackerRecoveryProposal, TrackerSyncIssueSummary } from "@desktop/types";
import { desktopApi } from "../lib/desktop-api";

export function useTrackerSyncRecovery(afterChange: () => Promise<void>) {
  const issues = ref<TrackerSyncIssueSummary[]>([]);
  const proposal = ref<TrackerRecoveryProposal>();
  const open = ref(false);
  const busy = ref(false);
  const error = ref<string>();

  async function load(): Promise<void> {
    try { issues.value = await desktopApi.tracker.syncIssues(); }
    catch { /* the main Tracker load owns the visible connection error */ }
  }

  async function prepare(
    issue: TrackerSyncIssueSummary,
    action: TrackerRecoveryProposal["action"],
  ): Promise<void> {
    await run(async () => {
      proposal.value = await desktopApi.tracker.prepareRecovery({
        entityType: issue.entityType, entityId: issue.entityId, action,
      });
    });
  }

  async function execute(): Promise<void> {
    if (!proposal.value) return;
    await run(async () => {
      await desktopApi.tracker.executeRecovery(proposal.value!.id);
      proposal.value = undefined;
      await Promise.all([load(), afterChange()]);
    });
  }

  async function retryPending(): Promise<void> {
    await run(async () => { await desktopApi.tracker.retryPending(); });
  }

  async function run(task: () => Promise<void>): Promise<void> {
    busy.value = true;
    error.value = undefined;
    try { await task(); } catch (cause) {
      error.value = cause instanceof Error ? cause.message : "同步恢复失败";
    } finally { busy.value = false; }
  }

  return { busy, error, execute, issues, load, open, prepare, proposal, retryPending };
}

