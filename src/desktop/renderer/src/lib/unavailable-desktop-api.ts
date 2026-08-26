import type { DesktopApi } from "@desktop/types";
import { translate } from "../i18n/locale";

export function createUnavailableDesktopApi(): DesktopApi {
  const unavailable = async (): Promise<never> => {
    throw new Error(translate("桌面安全桥接加载失败，请重新启动 Coolto"));
  };
  return {
    platform: "darwin",
    auth: {
      getCurrentUser: unavailable,
      getCredits: unavailable,
      requestEmailCode: unavailable,
      verifyEmailCode: unavailable,
      logout: unavailable,
      syncNow: unavailable,
    },
    checkout: {
      plans: unavailable,
      create: unavailable,
      verify: unavailable,
    },
    shell: {
      openExternal: unavailable,
    },
    mailConnections: {
      providers: unavailable, list: unavailable,
      connect: unavailable, disconnect: unavailable,
    },
    conversations: {
      list: unavailable,
      create: unavailable,
      get: unavailable,
      rename: unavailable,
      delete: unavailable,
    },
    attachments: {
      list: unavailable,
      select: unavailable,
      selectPath: unavailable,
      remove: unavailable,
    },
    getPathForFile: () => "", 
    resumeDrafts: {
      list: unavailable,
      get: unavailable,
      edit: unavailable,
      setLineSpacing: unavailable,
      restore: unavailable,
      accept: unavailable,
      reject: unavailable,
      exportPdf: unavailable,
      save: unavailable,
    },
    updates: {
      getState: unavailable,
      check: unavailable,
      install: unavailable,
      onStateChange: () => () => undefined,
    },
    agent: {
      prompt: unavailable,
      cancel: unavailable,
      resolveApproval: unavailable,
      onEvent: () => () => undefined,
    },
    agentTasks: {
      list: unavailable,
      get: unavailable,
      prepare: unavailable,
      executeProposal: unavailable,
      start: unavailable,
      resume: unavailable,
      pause: unavailable,
      cancel: unavailable,
      revoke: unavailable,
      submissionReceipt: unavailable,
    },
    library: {
      list: unavailable,
      preview: unavailable,
      rename: unavailable,
      archive: unavailable,
      deleteDraft: unavailable,
      getCheckpoints: unavailable,
      restoreCheckpoint: unavailable,
    },
    jobAssets: {
      get: unavailable,
    },
    experiences: {
      search: unavailable,
      get: unavailable,
      history: unavailable,
      prepareCreate: unavailable,
      prepareUpdate: unavailable,
      prepareArchive: unavailable,
      prepareRestore: unavailable,
      prepareDelete: unavailable,
      prepareRestoreRevision: unavailable,
      syncIssue: unavailable,
      prepareAcceptServer: unavailable,
      prepareReapply: unavailable,
      prepareSaveAsNew: unavailable,
      executeProposal: unavailable,
    },
    profile: {
      get: unavailable,
      prepareUpdate: unavailable,
      prepareReapply: unavailable,
      prepareAcceptServer: unavailable,
      executeProposal: unavailable,
    },
    applications: {
      list: unavailable,
      references: unavailable,
      get: unavailable,
      create: unavailable,
      prepareCreate: unavailable,
      prepareUpdate: unavailable,
      executeProposal: unavailable,
      update: unavailable,
      transition: unavailable,
      delete: unavailable,
    },
    tracker: { detail: unavailable, overview: unavailable, syncIssues: unavailable,
      prepareRecovery: unavailable, executeRecovery: unavailable, retryPending: unavailable },
    interviews: childUnavailable(unavailable),
    notes: childUnavailable(unavailable),
    reminders: childUnavailable(unavailable),
    window: {
      minimize: unavailable,
      toggleMaximize: unavailable,
      close: unavailable,
      reportDraftSaveState: unavailable,
      completeSaveBeforeClose: unavailable,
      onSaveBeforeClose: () => () => undefined,
    },
    data: {
      clearLocal: unavailable,
    },
    browser: {
      open: unavailable,
      close: unavailable,
      navigate: unavailable,
      goBack: unavailable,
      goForward: unavailable,
      reload: unavailable,
      getState: unavailable,
      abortFill: unavailable,
      onStateChanged: () => () => undefined,
      onFillProgress: () => () => undefined,
      onReviewDecision: () => () => undefined,
      onReviewComplete: () => () => undefined,
      onCaptchaDetected: () => () => undefined,
    },
  };
}

function childUnavailable(unavailable: () => Promise<never>) {
  return {
    prepareCreate: unavailable,
    prepareUpdate: unavailable,
    prepareDelete: unavailable,
    executeProposal: unavailable,
  };
}
