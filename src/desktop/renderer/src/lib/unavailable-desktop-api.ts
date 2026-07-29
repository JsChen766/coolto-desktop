import type { DesktopApi } from "@desktop/types";

export function createUnavailableDesktopApi(): DesktopApi {
  const unavailable = async (): Promise<never> => {
    throw new Error("桌面安全桥接加载失败，请重新启动 Coolto");
  };
  return {
    platform: "darwin",
    auth: {
      getCurrentUser: unavailable,
      login: unavailable,
      requestEmailCode: unavailable,
      verifyEmailCode: unavailable,
      logout: unavailable,
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
      remove: unavailable,
    },
    resumeDrafts: {
      list: unavailable,
      get: unavailable,
      edit: unavailable,
      restore: unavailable,
      accept: unavailable,
      reject: unavailable,
    },
    agent: {
      prompt: unavailable,
      cancel: unavailable,
      resolveApproval: unavailable,
      onEvent: () => () => undefined,
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
      prepareUpdate: unavailable,
      prepareArchive: unavailable,
      prepareRestore: unavailable,
      prepareDelete: unavailable,
      syncIssue: unavailable,
      prepareAcceptServer: unavailable,
      prepareReapply: unavailable,
      prepareSaveAsNew: unavailable,
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
    window: {
      minimize: unavailable,
      toggleMaximize: unavailable,
      close: unavailable,
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
