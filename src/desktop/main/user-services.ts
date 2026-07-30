import type { BrowserWindow } from "electron";

import type { BrowserPageOperator, BrowserPageReader } from "../../browser/types.js";
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

export interface UserServices {
  ownerId: string;
  conversations: ConversationStore;
  resumeDrafts: ResumeDraftService;
  resumeDraftEditing: ResumeDraftEditingService;
  agent: DesktopAgentRuntime;
  selectedFiles: ConversationSelectedFiles;
  resumes: ResumeSyncStore;
  jds: JdSyncStore;
  applications: ApplicationSyncStore;
  applicationProposals: ApplicationProposalService;
  experiences: ExperienceSyncStore;
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
}

export class UserServicesResolver {
  private services: UserServices | undefined;

  public constructor(
    private readonly auth: DesktopAuthService,
    private readonly window: BrowserWindow,
    private readonly resumeCompiler: ResumePdfCompiler,
    private readonly browserPageReader: BrowserPageReader,
    private readonly browserPageOperator: BrowserPageOperator,
  ) {}

  public async get(): Promise<UserServices> {
    const user = this.auth.requireCurrentUser();
    if (this.services?.ownerId === user.id) return this.services;
    const conversations = new ConversationStore(user.id);
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
    const interviews = new InterviewSyncStore(syncStore, triggerSync, waitForInitialSync);
    const notes = new NoteSyncStore(syncStore, triggerSync, waitForInitialSync);
    const reminders = new ReminderSyncStore(syncStore, triggerSync, waitForInitialSync);
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
    this.services = {
      ownerId: user.id,
      conversations,
      resumeDrafts,
      resumeDraftEditing: new ResumeDraftEditingService(
        resumeDrafts,
        new ResumeManualEditor(this.resumeCompiler),
      ),
      agent: new DesktopAgentRuntime(
        this.auth.apiClient,
        conversations,
        resumeDrafts,
        this.window.webContents,
        this.resumeCompiler,
        resumePdfExports,
        selectedFiles,
        this.browserPageReader,
        this.browserPageOperator,
        resumes,
        experiences,
        jds,
      ),
      selectedFiles,
      resumes,
      jds,
      applications,
      applicationProposals,
      experiences,
      experienceHistory,
      experienceProposals,
      trackerDetail,
      interviews,
      interviewProposals: new InterviewProposalService(interviews),
      notes,
      noteProposals: new NoteProposalService(notes),
      reminders,
      reminderProposals: new ReminderProposalService(reminders),
      reminderScheduler,
      trackerRecovery: new TrackerRecoveryService(
        syncStore, triggerSync, waitForInitialSync, () => this.auth.syncNow(),
      ),
    };
    return this.services;
  }

  public clear(): void {
    this.services?.agent.cancel();
    this.services?.selectedFiles.clear();
    this.services?.reminderScheduler.dispose();
    this.services = undefined;
  }
}
