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
  const childUnsupported = {
    prepareCreate: async (): Promise<never> => { throw new Error("Demo 不支持 Tracker 子记录维护"); },
    prepareUpdate: async (): Promise<never> => { throw new Error("Demo 不支持 Tracker 子记录维护"); },
    prepareDelete: async (): Promise<never> => { throw new Error("Demo 不支持 Tracker 子记录维护"); },
    executeProposal: async (): Promise<never> => { throw new Error("Demo 不支持 Tracker 子记录维护"); },
  };
  return {
    platform: "darwin",
    auth: {
      getCurrentUser: async () => currentUser,
      getCredits: async () => ({
        weeklyFreeCredits: 10,
        creditBalance: 15,
        planType: "NONE",
        hasFreeTrial: true,
        recentTransactions: [],
      }),
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
      syncNow: async () => undefined,
    },
    checkout: {
      plans: async () => [
        { planType: "WEEKLY", priceCny: 990, credits: 100, validDays: 7 },
        { planType: "MONTHLY", priceCny: 2990, credits: 400, validDays: 30 },
      ],
      create: async (planType) => ({
        checkoutId: `demo-${planType}-${Date.now()}`,
        afdianUrl: `https://ifdian.net/order/create?custom_order_id=demo&plan_type=${planType}`,
      }),
      verify: async () => ({ status: "pending", credits: 0 }),
    },
    shell: {
      openExternal: async () => undefined,
    },
    conversations: chat.conversations,
    attachments: chat.attachments,
    resumeDrafts: createDemoResumeDraftApi(draft),
    updates: {
      getState: async () => ({
        phase: "idle",
        currentVersion: "0.1.0",
        updateVersion: null,
        percent: null,
        message: null,
        errorStage: null,
      }),
      check: async () => undefined,
      install: async () => undefined,
      onStateChange: () => () => undefined,
    },
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
    profile: {
      get: async () => ({ fullName: null, contactEmail: null, email: null, phone: null,
        location: null, linkedinUrl: null, githubUrl: null, personalWebsite: null,
        currentTitle: null, currentCompany: null, yearsOfExperience: null,
        careerStage: null, targetRoles: [], targetIndustries: [], targetLocations: [],
        preferredLanguage: "zh-CN", resumeStyle: null, syncStatus: "clean" }),
      prepareUpdate: async () => { throw new Error("Demo 不支持个人资料维护"); },
      prepareReapply: async () => { throw new Error("Demo 不支持个人资料维护"); },
      prepareAcceptServer: async () => { throw new Error("Demo 不支持个人资料维护"); },
      executeProposal: async () => { throw new Error("Demo 不支持个人资料维护"); },
    },
    applications: createDemoApplicationApi(now),
    tracker: {
      detail: async () => ({ statusEvents: [], interviews: [], notes: [], reminders: [] }),
      overview: async () => ({ statusEvents: [], interviews: [], notes: [], reminders: [] }),
      syncIssues: async () => [],
      prepareRecovery: async () => { throw new Error("Demo 中没有同步问题"); },
      executeRecovery: async () => undefined,
      retryPending: async () => undefined,
    },
    interviews: childUnsupported,
    notes: childUnsupported,
    reminders: childUnsupported,
    window: {
      minimize: async () => undefined,
      toggleMaximize: async () => undefined,
      close: async () => undefined,
    },
    data: {
      clearLocal: async () => undefined,
    },
    browser: createDemoBrowserApi(),
  };
}
