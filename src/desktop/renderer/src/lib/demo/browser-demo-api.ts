import type { DesktopApi, DesktopUser } from "@desktop/types";

import { createDemoApplicationApi } from "./demo-application-api";
import { createDemoJobAssetsApi } from "./demo-job-assets-api";
import { createDemoBrowserApi } from "./demo-browser-api";
import { createDemoChatApis } from "./demo-chat-api";
import {
  createDemoLibraryApi,
  createDemoResumeDraftApi,
} from "./demo-resume-api";
import { createDemoDraft } from "./demo-resume-data";

export function createBrowserDemoApi(): DesktopApi {
  const now = new Date();
  const draft = createDemoDraft(now);
  const chat = createDemoChatApis(draft, now);
  let currentUser: DesktopUser = {
    id: "preview-user",
    email: "preview@example.com",
  };
  return {
    platform: "darwin",
    auth: {
      getCurrentUser: async () => currentUser,
      login: async (email) => {
        currentUser = { id: "preview-user", email };
        return currentUser;
      },
      requestEmailCode: async () => ({
        challengeId: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
        retryAfterSeconds: 60,
      }),
      verifyEmailCode: async (email) => {
        currentUser = { id: "preview-user", email };
        return currentUser;
      },
      logout: async () => undefined,
    },
    conversations: chat.conversations,
    attachments: chat.attachments,
    resumeDrafts: createDemoResumeDraftApi(draft),
    agent: chat.agent,
    library: createDemoLibraryApi(),
    jobAssets: createDemoJobAssetsApi(now),
    experiences: {
      search: async () => ({ items: [], nextCursor: null }),
      get: async () => { throw new Error("Demo 中没有经历"); },
      history: async () => ({
        items: [], nextCursor: null, pendingRevision: null, unavailable: false,
      }),
      prepareCreate: async () => { throw new Error("Demo 不支持经历维护"); },
      prepareUpdate: async () => { throw new Error("Demo 不支持经历维护"); },
      prepareArchive: async () => { throw new Error("Demo 不支持经历维护"); },
      prepareRestore: async () => { throw new Error("Demo 不支持经历维护"); },
      prepareDelete: async () => { throw new Error("Demo 不支持经历维护"); },
      prepareRestoreRevision: async () => { throw new Error("Demo 不支持版本恢复"); },
      syncIssue: async () => { throw new Error("Demo 中没有同步问题"); },
      prepareAcceptServer: async () => { throw new Error("Demo 不支持冲突恢复"); },
      prepareReapply: async () => { throw new Error("Demo 不支持冲突恢复"); },
      prepareSaveAsNew: async () => { throw new Error("Demo 不支持冲突恢复"); },
      executeProposal: async () => { throw new Error("Demo 不支持经历维护"); },
    },
    applications: createDemoApplicationApi(now),
    window: {
      minimize: async () => undefined,
      toggleMaximize: async () => undefined,
      close: async () => undefined,
    },
    browser: createDemoBrowserApi(),
  };
}
