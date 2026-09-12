import type { AgentTaskV1 } from "../../../agent-task/task-types.js";
import type { LocalResumeDraft } from "../../../resume/draft/types.js";
import type { LocalSyncStore } from "../sync/local-sync-store.js";
import { createElectronAgentHarness } from "../agent-task/create-electron-agent-harness.js";
import { ConversationStore } from "../conversation-store.js";
import { createElectronResumeDraftRepository } from "../resume-drafts/electron-draft-repository.js";
import { ResumeDraftService } from "../resume-drafts/resume-draft-service.js";
import type { UserServices } from "../user-services-contract.js";
import type { ExportLocalReader, ExportLocalReadOptions } from "./data-export-service.js";
import type { ExportLocalPayload } from "../../../privacy/export-types.js";

const SYNC_TYPES = [
  "user_profile", "experience", "job_description", "resume", "application",
  "application_status_event", "interview_round", "application_note", "reminder",
] as const;

export function createLocalExportReader(
  getServices: () => UserServices | undefined,
  getSyncStore: () => LocalSyncStore | undefined,
): ExportLocalReader {
  return {
    async read(options): Promise<{ payload: ExportLocalPayload; hasPending: boolean }> {
      const selection = options ?? {
        apiBaseUrl: "",
        ownerId: "",
        includeConversations: true,
        includeDrafts: true,
        includeTasks: true,
      };
      if (!selection.ownerId || !selection.apiBaseUrl) throw new Error("导出缺少账号范围");
      const services = getServices();
      if (services?.ownerId === selection.ownerId &&
          services.apiBaseUrl === selection.apiBaseUrl) {
        return readFromServices(services, getSyncStore(), selection);
      }
      return readFromLocalOwner(selection.ownerId, selection);
    },
  };
}

async function readFromServices(
  services: UserServices,
  syncStore: LocalSyncStore | undefined,
  options: ExportLocalReadOptions,
): Promise<{ payload: ExportLocalPayload; hasPending: boolean }> {
  const [conversations, drafts, tasks] = await Promise.all([
    options.includeConversations ? readConversations(services.conversations) : undefined,
    options.includeDrafts
      ? services.resumeDrafts.listReusableDrafts().then((values) => values.map(sanitizeDraft))
      : undefined,
    options.includeTasks
      ? services.agentHarness.tasks.list().then((values) => values.map(sanitizeTask))
      : undefined,
  ]);
  return {
    payload: {
      ...(conversations ? { conversations } : {}),
      ...(drafts ? { drafts } : {}),
      ...(tasks ? { tasks } : {}),
    },
    hasPending: syncStore?.hasPendingLocalChanges(SYNC_TYPES) ?? false,
  };
}
async function readFromLocalOwner(
  ownerId: string,
  options: ExportLocalReadOptions,
): Promise<{ payload: ExportLocalPayload; hasPending: boolean }> {
  const apiBaseUrl = options.apiBaseUrl;
  const [conversations, drafts, tasks] = await Promise.all([
    options.includeConversations ? readConversations(new ConversationStore(apiBaseUrl, ownerId)) : undefined,
    options.includeDrafts
      ? new ResumeDraftService(ownerId, createElectronResumeDraftRepository(apiBaseUrl, ownerId))
        .listReusableDrafts().then((values) => values.map(sanitizeDraft))
      : undefined,
    options.includeTasks
      ? createElectronAgentHarness(apiBaseUrl, ownerId).then((harness) =>
        harness.tasks.list().then((values) => values.map(sanitizeTask)))
      : undefined,
  ]);
  return {
    payload: {
      ...(conversations ? { conversations } : {}),
      ...(drafts ? { drafts } : {}),
      ...(tasks ? { tasks } : {}),
    },
    hasPending: false,
  };
}

async function readConversations(store: ConversationStore): Promise<unknown[]> {
  const summaries = await store.list();
  return Promise.all(summaries.map((summary) => store.get(summary.id)));
}

function sanitizeDraft(draft: LocalResumeDraft): unknown {
  return {
    artifactId: draft.artifactId,
    title: draft.title,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
    workspace: draft.workspace,
    checkpoints: draft.checkpoints,
    pendingChange: draft.pendingChange,
    cloudLink: draft.cloudLink,
  };
}

function sanitizeTask(task: AgentTaskV1): unknown {
  return {
    kind: "agent_task",
    title: task.goal.slice(0, 200),
    status: task.status,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    terminalReason: task.terminalAt ? task.status : null,
  };
}
