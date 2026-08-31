import type { BrowserWindow } from "electron";
import type { CooltoApiClient } from "../../api/coolto-api-client.js";
import type { BrowserAgentController } from "../../browser/agent-control-types.js";
import type { BrowserPageOperator } from "../../browser/types.js";
import type { BrowserAgentStatusBridge } from "./browser/browser-agent-status-bridge.js";
import type { AgentHarnessServices } from "../../agent-task/agent-harness-services.js";
import { ResumeManualEditor } from "../../resume/draft/manual-editor.js";
import type { ResumePdfCompiler } from "../../resume/export/types.js";
import { DesktopAgentRuntime } from "./agent-runtime.js";
import { ApplicationSyncStore } from "./application-library/application-sync-store.js";
import { ApplicationProposalService } from "./application-library/application-proposal-service.js";
import { DesktopAuthService } from "./auth-service.js";
import { ConversationSelectedFiles } from "./conversation-selected-files.js";
import { ConversationStore } from "./conversation-store.js";
import { ElectronResumePdfSaveDialog } from "./electron-pdf-save-dialog.js";
import { ExperienceSyncStore } from "./experience-library/experience-sync-store.js";
import { ProfileProposalService } from "./profile/profile-proposal-service.js";
import { ProfileSyncStore } from "./profile/profile-sync-store.js";
import { ExperienceHistoryService } from "./experience-library/experience-history-service.js";
import { ExperienceMutationExecutor } from "./experience-library/experience-mutation-executor.js";
import { ExperienceProposalService } from "./experience-library/experience-proposal-service.js";
import { JdSyncStore } from "./jd-library/jd-sync-store.js";
import { ResumeDraftCloudLinker } from "./resume-library/resume-draft-cloud-linker.js";
import { ResumeSyncStore } from "./resume-library/resume-sync-store.js";
import { createElectronResumeDraftRepository } from "./resume-drafts/electron-draft-repository.js";
import { ResumeDraftEditingService } from "./resume-drafts/draft-editing-service.js";
import { ResumeDraftService } from "./resume-drafts/resume-draft-service.js";
import { ResumePdfExportService } from "./resume-pdf-export-service.js";
import { ApplicationTrackerDetailService } from "./tracker/application-tracker-detail-service.js";
import { InterviewProposalService } from "./tracker/interview-proposal-service.js";
import { InterviewSyncStore } from "./tracker/interview-sync-store.js";
import { NoteProposalService } from "./tracker/note-proposal-service.js";
import { NoteSyncStore } from "./tracker/note-sync-store.js";
import { ReminderProposalService } from "./tracker/reminder-proposal-service.js";
import { ReminderSyncStore } from "./tracker/reminder-sync-store.js";
import { StatusEventReader } from "./tracker/status-event-reader.js";
import { ReminderNotificationScheduler } from "./tracker/reminder-notification-scheduler.js";
import { TrackerRecoveryService } from "./tracker/tracker-recovery-service.js";
import { createElectronAgentHarness } from "./agent-task/create-electron-agent-harness.js";
import { createAgentTaskRuntime } from "./agent-task/create-agent-task-runner.js";
import type { AgentTaskRunner } from "../../agent-task/agent-task-runner.js";
import type { AgentTaskScheduler } from "../../agent-task/agent-task-scheduler.js";
import { AgentTaskProposalService } from "./agent-task/agent-task-proposal-service.js";
import { clearUserServices } from "./clear-user-services.js";
import { ElectronMailConnectionService } from "./mail-connections/electron-mail-connection-service.js";
import { createCalendarService } from "./calendar/create-calendar-service.js";
export interface UserServices {
  ownerId: string;
  conversations: ConversationStore;
  resumeDrafts: ResumeDraftService;
  resumeDraftEditing: ResumeDraftEditingService;
  resumePdfExports: ResumePdfExportService;
  agent: DesktopAgentRuntime;
  agentHarness: AgentHarnessServices;
  agentTasks: AgentTaskRunner;
  agentTaskProposals: AgentTaskProposalService;
  agentTaskScheduler: AgentTaskScheduler;
  selectedFiles: ConversationSelectedFiles;
  resumes: ResumeSyncStore;
  jds: JdSyncStore;
  applications: ApplicationSyncStore;
  applicationProposals: ApplicationProposalService;
  experiences: ExperienceSyncStore;
  profiles: ProfileSyncStore;
  profileProposals: ProfileProposalService;
  experienceHistory: ExperienceHistoryService;
  experienceProposals: ExperienceProposalService;
  trackerDetail: ApplicationTrackerDetailService;
  interviews: InterviewSyncStore;
  interviewProposals: InterviewProposalService;
  notes: NoteSyncStore;
  noteProposals: NoteProposalService;
  reminders: ReminderSyncStore;
  reminderProposals: ReminderProposalService;
  reminderScheduler: ReminderNotificationScheduler;
  trackerRecovery: TrackerRecoveryService;
  mailConnections: ElectronMailConnectionService;
  calendar: ReturnType<typeof createCalendarService>;
}
export class UserServicesResolver {
  private services: UserServices | undefined;
  public constructor(
    private readonly auth: DesktopAuthService,
    private readonly window: BrowserWindow,
    private readonly resumeCompiler: ResumePdfCompiler,
    private readonly browserAgentController: BrowserAgentController,
    private readonly browserPageOperator: BrowserPageOperator,
    private readonly browserAgentStatus: BrowserAgentStatusBridge,
  ) {}
  public async get(): Promise<UserServices> {
    const user = this.auth.requireCurrentUser();
    if (this.services?.ownerId === user.id) return this.services;
    const conversations = new ConversationStore(user.id);
    const agentHarness = await createElectronAgentHarness(user.id);
    const resumeDrafts = new ResumeDraftService(
      user.id,
      createElectronResumeDraftRepository(user.id),
    );
    const selectedFiles = new ConversationSelectedFiles();
    const draftRepository = createElectronResumeDraftRepository(user.id);
    const draftLinker = new ResumeDraftCloudLinker(draftRepository);
    const syncStore = this.auth.requireSyncStore();
    const triggerSync = () => this.auth.triggerSync();
    const waitForInitialSync = () => this.auth.waitForInitialSync();
    const resumes = new ResumeSyncStore(
      syncStore,
      triggerSync,
      waitForInitialSync,
      (candidateId, resume) => draftLinker.link(candidateId, resume),
    );
    const experiences = new ExperienceSyncStore(
      syncStore,
      triggerSync,
      waitForInitialSync,
    );
    const profiles = new ProfileSyncStore(user.id, syncStore, triggerSync, waitForInitialSync);
    const profileProposals = new ProfileProposalService(profiles, waitForInitialSync);
    const experienceHistory = new ExperienceHistoryService(
      syncStore,
      this.auth.apiClient,
    );
    const experienceProposals = new ExperienceProposalService(
      syncStore,
      new ExperienceMutationExecutor(syncStore, triggerSync),
      waitForInitialSync,
    );
    const jds = new JdSyncStore(syncStore, triggerSync, waitForInitialSync);
    const applications = new ApplicationSyncStore(
      syncStore,
      triggerSync,
      waitForInitialSync,
    );
    const applicationProposals = new ApplicationProposalService(syncStore, applications);
    const mailConnections = new ElectronMailConnectionService(user.id);
    const interviews = new InterviewSyncStore(syncStore, triggerSync, waitForInitialSync);
    const interviewProposals = new InterviewProposalService(interviews);
    const notes = new NoteSyncStore(syncStore, triggerSync, waitForInitialSync);
    const reminders = new ReminderSyncStore(syncStore, triggerSync, waitForInitialSync);
    const calendar = createCalendarService(user.id, applications, interviews, reminders);
    const trackerDetail = new ApplicationTrackerDetailService(
      new StatusEventReader(syncStore, waitForInitialSync), interviews, notes, reminders,
    );
    const reminderScheduler = new ReminderNotificationScheduler(
      reminders, syncStore, this.window,
    );
    const resumePdfExports = new ResumePdfExportService(
      this.resumeCompiler,
      new ElectronResumePdfSaveDialog(this.window),
    );
    const agentTaskProposals = new AgentTaskProposalService(agentHarness);
    const agent = new DesktopAgentRuntime(
      this.auth.apiClient, conversations, resumeDrafts, this.window.webContents,
      this.resumeCompiler, selectedFiles, this.browserAgentController,
      this.browserPageOperator, agentHarness, agentTaskProposals,
      resumes, applications, applicationProposals, mailConnections,
      interviews, interviewProposals, experiences, jds, profiles,
      profileProposals, experienceProposals,
      () => readCompactionThreshold(this.auth.apiClient),
      () => runSyncNow(this.auth),
    );
    const { agentTasks, agentTaskScheduler } = await createAgentTaskRuntime(
      agentHarness, agent, this.browserAgentStatus, this.browserPageOperator,
      this.browserAgentController);
    this.services = {
      ownerId: user.id,
      conversations,
      resumeDrafts,
      resumeDraftEditing: new ResumeDraftEditingService(
        resumeDrafts,
        new ResumeManualEditor(this.resumeCompiler),
      ),
      resumePdfExports,
      agent,
      agentHarness,
      agentTasks,
      agentTaskProposals,
      agentTaskScheduler,
      selectedFiles,
      resumes,
      jds,
      applications,
      applicationProposals,
      experiences,
      profiles,
      profileProposals,
      experienceHistory,
      experienceProposals,
      trackerDetail,
      interviews,
      interviewProposals,
      notes,
      noteProposals: new NoteProposalService(notes),
      reminders,
      reminderProposals: new ReminderProposalService(reminders),
      reminderScheduler,
      trackerRecovery: new TrackerRecoveryService(
        syncStore, triggerSync, waitForInitialSync, () => this.auth.syncNow(),
      ),
      mailConnections,
      calendar,
    };
    return this.services;
  }
  public async clear(
    reason: "window_closed" | "account_changed" = "window_closed",
  ): Promise<void> {
    const current = this.services;
    this.services = undefined;
    await clearUserServices({
      current, reason, browser: this.browserPageOperator,
      status: this.browserAgentStatus,
    });
  }
  /** Best-effort snapshot of the in-flight agent transcript. No-op when no
   * services or no running generation exist; never creates services (used at
   * window close / app quit, where the runtime must not be rebuilt). */
  public async flushPending(): Promise<void> {
    await this.services?.agent.flushPending();
  }
}
/**
 * Reads the context-compaction threshold from the server app-config once and
 * caches it; any failure falls back to the client default so conversation
 * flow is never blocked by configuration availability.
 */
let compactionThresholdCache: number | undefined;
async function readCompactionThreshold(
  apiClient: CooltoApiClient,
): Promise<number | undefined> {
  if (compactionThresholdCache !== undefined) {
    return compactionThresholdCache;
  }
  try {
    const config = await apiClient.getAppConfig();
    compactionThresholdCache = config.contextCompactThresholdTokens;
  } catch {
    compactionThresholdCache = undefined;
  }
  return compactionThresholdCache;
}
/** Agent sync_now tool: runs one sync round and reports the outcome. */
async function runSyncNow(auth: DesktopAuthService): Promise<{ ok: boolean; message: string }> {
  try {
    await auth.syncNow();
    return { ok: true, message: "本地数据已同步到云端。" };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `同步失败：${message}` };
  }
}
