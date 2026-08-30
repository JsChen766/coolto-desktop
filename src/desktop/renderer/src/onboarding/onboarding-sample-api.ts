import type {
  DesktopApi,
  OnboardingStep,
} from "../../../shared/types.js";
import { projectJobRepository } from "../../../../job-assets/repository-projection.js";
import { createOnboardingSampleResumeApi } from "./onboarding-sample-resume-api.js";
import {
  SAMPLE_APPLICATION_ID,
  SAMPLE_DRAFT_ID,
  SAMPLE_JD_ID,
  SAMPLE_RESUME_ID,
  sampleApplication,
  sampleDraft,
  sampleExperiences,
  sampleJd,
  sampleProfile,
  sampleResumeEntry,
} from "./onboarding-sample-data.js";

export interface OnboardingSampleRuntime {
  api: DesktopApi;
  setStep(step: OnboardingStep): void;
}

export function createOnboardingSampleRuntime(
  base: DesktopApi,
  initialStep: OnboardingStep,
): OnboardingSampleRuntime {
  const now = new Date();
  const experiences = sampleExperiences(now);
  const jd = sampleJd(now);
  const draft = sampleDraft(now);
  const resume = sampleResumeEntry(draft);
  const application = sampleApplication(now);
  const draftApi = createOnboardingSampleResumeApi(draft);
  let step = initialStep;
  const blocked = async (): Promise<never> => {
    throw new Error("一次性示例空间不允许修改正式业务数据");
  };
  const resumeReady = () => [
    "browser", "browser_review", "tracker", "complete", "completed",
  ].includes(step);
  const applicationReady = () => ["tracker", "complete", "completed"].includes(step);
  const childBlocked = {
    prepareCreate: blocked, prepareUpdate: blocked,
    prepareDelete: blocked, executeProposal: blocked,
  };

  const api: DesktopApi = {
    ...base,
    auth: { ...base.auth, syncNow: async () => undefined },
    profile: {
      get: async () => sampleProfile(), prepareUpdate: blocked,
      prepareReapply: blocked, prepareAcceptServer: blocked,
      executeProposal: blocked,
    },
    experiences: {
      search: async (options) => ({
        items: experiences.filter((item) =>
          (!options?.status || item.status === options.status)
          && (!options?.category || item.category === options.category)),
        nextCursor: null,
      }),
      get: async (id) => structuredClone(requireById(experiences, id, "示例经历")),
      history: async ({ experienceId }) => ({
        items: structuredClone(requireById(experiences, experienceId, "示例经历").revisions),
        nextCursor: null, pendingRevision: null, unavailable: false,
      }),
      prepareCreate: blocked, prepareUpdate: blocked, prepareArchive: blocked,
      prepareRestore: blocked, prepareDelete: blocked,
      prepareRestoreRevision: blocked, syncIssue: blocked,
      prepareAcceptServer: blocked, prepareReapply: blocked,
      prepareSaveAsNew: blocked, executeProposal: blocked,
    },
    resumeDrafts: {
      ...draftApi,
      list: async () => resumeReady() ? draftApi.list() : [],
      get: async (id) => {
        if (!resumeReady()) throw new Error("示例简历尚未生成");
        return draftApi.get(id);
      },
      exportPdf: async () => ({ status: "cancelled" }),
      save: async () => structuredClone(draft),
    },
    library: {
      list: async () => resumeReady() ? [structuredClone(resume)] : [],
      preview: async () => ({
        resumeId: SAMPLE_RESUME_ID, title: resume.displayTitle,
        contentHash: "a".repeat(64), updatedAt: draft.updatedAt,
        structure: structuredClone(draft.structure),
      }),
      rename: blocked, archive: blocked, deleteDraft: blocked,
      getCheckpoints: async () => [], restoreCheckpoint: blocked,
    },
    deliveryResumeFiles: {
      list: async () => [], importFile: async () => undefined,
      rename: blocked, select: blocked, delete: async () => undefined,
    },
    jobAssets: {
      get: async () => projectJobRepository({
        jds: [jd],
        resumes: resumeReady() ? [resume] : [],
        applications: applicationReady() ? [application] : [],
        deliveryResumeFiles: [],
      }),
    },
    applications: {
      list: async () => ({
        items: applicationReady() ? [structuredClone(application)] : [],
        nextCursor: null,
      }),
      references: async () => ({
        jds: [{ id: SAMPLE_JD_ID, title: jd.title }],
        resumes: resumeReady()
          ? [{ id: SAMPLE_RESUME_ID, title: resume.displayTitle }] : [],
      }),
      get: async (id) => {
        if (!applicationReady() || id !== SAMPLE_APPLICATION_ID) {
          throw new Error("示例投递不存在");
        }
        return structuredClone(application);
      },
      create: blocked, prepareCreate: blocked, prepareUpdate: blocked,
      executeProposal: blocked, update: blocked, transition: blocked, delete: blocked,
    },
    tracker: {
      detail: async () => ({ statusEvents: [], interviews: [], notes: [], reminders: [] }),
      overview: async () => ({ statusEvents: [], interviews: [], notes: [], reminders: [] }),
      syncIssues: async () => [], prepareRecovery: blocked,
      executeRecovery: async () => undefined, retryPending: async () => undefined,
    },
    interviews: childBlocked,
    notes: childBlocked,
    reminders: childBlocked,
    agentTasks: { ...base.agentTasks, submissionReceipt: async () => undefined },
  };
  return { api, setStep: (next) => { step = next; } };
}

function requireById<T extends { id: string }>(
  values: T[],
  id: string,
  label: string,
): T {
  const value = values.find((item) => item.id === id);
  if (!value) throw new Error(`${label}不存在`);
  return value;
}

export { SAMPLE_DRAFT_ID, SAMPLE_JD_ID };
