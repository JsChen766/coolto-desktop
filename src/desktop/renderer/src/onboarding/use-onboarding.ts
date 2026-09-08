import { computed, ref, watch } from "vue";

import type { OnboardingAction, OnboardingResult, OnboardingStatus } from
  "@desktop/types";
import type { AppShell } from "../app/use-app-shell";
import {
  getBaseDesktopApi,
  setDesktopApiOverride,
} from "../lib/desktop-api";
import {
  createOnboardingSampleRuntime,
  SAMPLE_DRAFT_ID,
  type OnboardingSampleRuntime,
} from "./onboarding-sample-api";
import { appLocale } from "../i18n/locale";

export function useOnboarding(shell: AppShell) {
  const status = ref<OnboardingStatus>();
  const checking = ref(false);
  const active = ref(false);
  const busy = ref(false);
  const error = ref<string>();
  let runtime: OnboardingSampleRuntime | undefined;
  let initialization = 0;
  const base = getBaseDesktopApi();

  const blocking = computed(() => Boolean(shell.user.value) && (
    checking.value || active.value || Boolean(error.value)
  ));

  watch(
    [shell.user, shell.authenticatedReady],
    ([user, ready]) => {
      if (!user) {
        initialization += 1;
        deactivate();
        checking.value = false;
        error.value = undefined;
        return;
      }
      checking.value = true;
      if (ready) void initialize(++initialization);
    },
    { immediate: true },
  );

  watch(
    () => shell.fillProgress.lastOutcome.value?.at,
    (at) => {
      if (at && status.value?.step === "browser_review" && !busy.value) {
        void advance("finish_browser_demo");
      }
    },
  );

  async function initialize(run: number): Promise<void> {
    error.value = undefined;
    try {
      const current = await base.onboarding.status();
      if (run !== initialization) return;
      if (current.state === "completed") {
        status.value = current;
        deactivate();
        return;
      }
      const result = await base.onboarding.start(appLocale.value);
      if (run !== initialization) return;
      status.value = result.status;
      runtime = createOnboardingSampleRuntime(base, result.status.step);
      setDesktopApiOverride(runtime.api);
      active.value = true;
      shell.activeView.value = "chat";
      shell.resumeWorkspace.clear();
      await loadSampleResumeIfReady();
      if (result.conversation) {
        await shell.reloadConversation(result.conversation.id);
      }
    } catch (cause) {
      if (run === initialization) error.value = messageOf(cause);
    } finally {
      if (run === initialization) checking.value = false;
    }
  }

  async function advance(action: OnboardingAction): Promise<void> {
    if (busy.value) return;
    busy.value = true;
    error.value = undefined;
    try {
      const result = await base.onboarding.advance(action, appLocale.value);
      status.value = result.status;
      runtime?.setStep(result.status.step);
      if (result.conversation) {
        await shell.reloadConversation(result.conversation.id);
      }
      if (action === "generate_sample_resume") {
        await shell.resumeWorkspace.loadDrafts();
        await shell.resumeWorkspace.openDraft(SAMPLE_DRAFT_ID);
        shell.artifactOpen.value = true;
        shell.activeArtifactType.value = "resume";
      } else if (action === "finish_browser_demo") {
        await base.browser.close();
      }
    } catch (cause) {
      error.value = messageOf(cause);
    } finally {
      busy.value = false;
    }
  }

  async function openBrowserDemo(): Promise<void> {
    shell.fillProgress.dismissOutcome();
    await advance("open_browser_demo");
    if (status.value?.step !== "browser_review" || error.value) return;
    busy.value = true;
    try {
      await base.onboarding.openBrowserDemo(shell.dark.value ? "dark" : "light");
    } catch (cause) {
      error.value = messageOf(cause);
    } finally {
      busy.value = false;
    }
  }

  async function reopenBrowserDemo(): Promise<void> {
    if (status.value?.step !== "browser_review") return;
    busy.value = true;
    error.value = undefined;
    shell.fillProgress.dismissOutcome();
    try {
      await base.onboarding.openBrowserDemo(shell.dark.value ? "dark" : "light");
    } catch (cause) {
      error.value = messageOf(cause);
    } finally {
      busy.value = false;
    }
  }

  async function complete(startExperience: boolean): Promise<void> {
    if (busy.value) return;
    busy.value = true;
    error.value = undefined;
    try {
      const result = await base.onboarding.complete(appLocale.value);
      status.value = result.status;
      await finish(result, startExperience);
    } catch (cause) {
      error.value = messageOf(cause);
    } finally {
      busy.value = false;
    }
  }

  async function skip(): Promise<boolean> {
    if (busy.value) return false;
    busy.value = true;
    error.value = undefined;
    initialization += 1;
    try {
      const result = await base.onboarding.skip();
      status.value = result.status;
      await finish(result, false);
      return true;
    } catch (cause) {
      error.value = messageOf(cause);
      return false;
    } finally {
      busy.value = false;
    }
  }

  async function finish(
    result: OnboardingResult,
    startExperience: boolean,
  ): Promise<void> {
    setDesktopApiOverride(undefined);
    runtime = undefined;
    shell.resumeWorkspace.clear();
    await shell.resumeWorkspace.loadDrafts();
    if (result.conversation) await shell.reloadConversation(result.conversation.id);
    else await shell.createChat();
    shell.activeView.value = "chat";
    shell.artifactOpen.value = false;
    active.value = false;
    if (startExperience) await shell.createChat();
  }

  async function retry(): Promise<void> {
    checking.value = true;
    await initialize(++initialization);
  }

  async function loadSampleResumeIfReady(): Promise<void> {
    shell.resumeWorkspace.clear();
    await shell.resumeWorkspace.loadDrafts();
    const hasDraft = shell.resumeWorkspace.drafts.value.some(
      (draft) => draft.artifactId === SAMPLE_DRAFT_ID,
    );
    if (hasDraft) await shell.resumeWorkspace.openDraft(SAMPLE_DRAFT_ID);
  }

  function deactivate(): void {
    setDesktopApiOverride(undefined);
    runtime = undefined;
    active.value = false;
    status.value = undefined;
  }

  return {
    active, advance, blocking, busy, checking, complete, error,
    openBrowserDemo, reopenBrowserDemo, retry, skip, status,
  };
}

export type OnboardingController = ReturnType<typeof useOnboarding>;

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
