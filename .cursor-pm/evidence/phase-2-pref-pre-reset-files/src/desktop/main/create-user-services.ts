import { app, type BrowserWindow } from "electron";
import { localScopeDigest } from "../../privacy/local-scope.js";
import { join } from "node:path";

import type { CooltoApiClient } from "../../api/coolto-api-client.js";
import type { BrowserAgentController } from "../../browser/agent-control-types.js";
import type { BrowserPageOperator } from "../../browser/types.js";
import type { BrowserAgentStatusBridge } from "./browser/browser-agent-status-bridge.js";
import { ResumeManualEditor } from "../../resume/draft/manual-editor.js";
import type { ResumePdfCompiler } from "../../resume/export/types.js";
import { DesktopAgentRuntime } from "./agent-runtime.js";
import { ApplicationSyncStore } from "./application-library/application-sync-store.js";
import { ApplicationProposalService } from "./application-library/application-proposal-service.js";
import { DesktopAuthService } from "./auth-service.js";
import {
  readCompactionThreshold,
  runSyncNow,
} from "./user-services-helpers.js";
import { ConversationStore } from "./conversation-store.js";
import { ElectronResumePdfSaveDialog } from "./electron-pdf-save-dialog.js";
import { ExperienceSyncStore } from "./experience-library/experience-sync-store.js";
import { ProfileProposalService } from "./profile/profile-proposal-service.js";
import { ProfileSyncStore } from "./profile/profile-sync-store.js";
import { PreferenceProposalService } from "./preference/preference-proposal-service.js";
import { PreferenceSyncStore } from "./preference/preference-sync-store.js";
import { resolveResumeProfilePreferenceContext } from "./profile-preference-context.js";
import { ExperienceHistoryService } from "./experience-library/experience-history-service.js";
import { ExperienceMutationExecutor } from "./experience-library/experience-mutation-executor.js";
import { ExperienceProposalService } from "./experience-library/experience-proposal-service.js";
import { JdSyncStore } from "./jd-library/jd-sync-store.js";
import { ResumeDraftCloudLinker } from "./resume-library/resume-draft-cloud-linker.js";
import { ResumeSyncStore } from "./resume-library/resume-sync-store.js";
import { createElectronResumeDraftRepository } from "./resume-drafts/electron-draft-repository.js";
import { ResumeDraftEditingService } from "./resume-drafts/draft-editing-service.js";
import { ResumeDraftService } from "./resume-drafts/resume-draft-service.js";
import { ResumeConversationLinkService } from
  "./resume-drafts/resume-conversation-link-service.js";
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
import { AgentTaskProposalService } from "./agent-task/agent-task-proposal-service.js";
import { ManagedResumeUploadService } from "./agent-task/managed-resume-upload-service.js";
import { ElectronMailConnectionService } from "./mail-connections/electron-mail-connection-service.js";
import { createUserFileServices } from "./user-file-services.js";
import type { BrowserWindowManager } from "./browser/browser-window-manager.js";
import { createOnboardingServices } from
  "./onboarding/create-onboarding-services.js";
import type { UserServices } from "./user-services-contract.js";
import { setBrowserSessionScope } from "./browser/browser-session.js";
import { createCalendarService } from "./calendar/create-calendar-service.js";

export interface UserServicesFactoryInput {
  auth: DesktopAuthService;
  window: BrowserWindow;
  resumeCompiler: ResumePdfCompiler;
  browserAgentController: BrowserAgentController;
  browserPageOperator: BrowserPageOperator;
  browserAgentStatus: BrowserAgentStatusBridge;
  browserWindow: BrowserWindowManager;
}

export async function createUserServices(input: UserServicesFactoryInput): Promise<UserServices> {
  const user = input.auth.requireCurrentUser();
  const apiBaseUrl = input.auth.apiBaseUrl;
  const scopeDigest = localScopeDigest(apiBaseUrl, user.id);
  if (!input.auth.privacy.isCloudBusinessAllowed) {
    throw new Error('请先完成当前版本的隐私同意或删除恢复');
  }
    setBrowserSessionScope(apiBaseUrl, user.id);
    const conversations = new ConversationStore(apiBaseUrl, user.id);
    const { onboarding, onboardingBrowser } = createOnboardingServices({
      apiBaseUrl, ownerId: user.id, conversations, browserWindow: input.browserWindow,
      browserPageOperator: input.browserPageOperator,
    });
    const agentHarness = await createElectronAgentHarness(apiBaseUrl, user.id);
    const resumeDrafts = new ResumeDraftService(
      user.id,
      createElectronResumeDraftRepository(apiBaseUrl, user.id),
    );
    const resumeConversationLinks = new ResumeConversationLinkService(
      conversations,
      resumeDrafts,
    );
    const { selectedFiles, deliveryResumeFiles } = createUserFileServices(apiBaseUrl, user.id);
    const draftRepository = createElectronResumeDraftRepository(apiBaseUrl, user.id);
    const draftLinker = new ResumeDraftCloudLinker(draftRepository);
    const syncStore = input.auth.requireSyncStore();
    const triggerSync = () => input.auth.triggerSync();
    const waitForInitialSync = () => input.auth.waitForInitialSync();
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
    const preferences = new PreferenceSyncStore(user.id, syncStore, triggerSync, waitForInitialSync);
    const preferenceProposals = new PreferenceProposalService(
      user.id, preferences, waitForInitialSync, agentHarness.preferenceSuggestions,
    );
    agentHarness.profilePreferenceContext = async () => {
      const context = await resolveResumeProfilePreferenceContext(
        user.id, "agent-task", profiles, preferences,
      );
      return {
        profileVersion: context.profileEntityVersion,
        ...(context.profileLocalVersion === undefined ? {} : {
          profileLocalVersion: context.profileLocalVersion,
        }),
        resolutionHash: context.preferenceResolutionHash,
      };
    };
    const experienceHistory = new ExperienceHistoryService(
      syncStore,
      input.auth.apiClient,
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
    const mailConnections = new ElectronMailConnectionService(apiBaseUrl, user.id);
    const managedResumeUploads = new ManagedResumeUploadService(
      join(app.getPath("userData"), "managed-resume-uploads"),
      apiBaseUrl, user.id, agentHarness, resumes, input.resumeCompiler, input.browserPageOperator,
    );
    void managedResumeUploads.cleanupExpired().catch(() => undefined);
    const interviews = new InterviewSyncStore(syncStore, triggerSync, waitForInitialSync);
    const interviewProposals = new InterviewProposalService(interviews);
    const notes = new NoteSyncStore(syncStore, triggerSync, waitForInitialSync);
    const reminders = new ReminderSyncStore(syncStore, triggerSync, waitForInitialSync);
    const reminderProposals = new ReminderProposalService(reminders);
    const calendar = createCalendarService(apiBaseUrl, user.id, applications, interviews, reminders);
    const trackerDetail = new ApplicationTrackerDetailService(
      new StatusEventReader(syncStore, waitForInitialSync), interviews, notes, reminders,
    );
    const reminderScheduler = new ReminderNotificationScheduler(
      reminders, syncStore, input.window,
    );
    const resumePdfExports = new ResumePdfExportService(
      input.resumeCompiler,
      new ElectronResumePdfSaveDialog(input.window),
    );
    const agentTaskProposals = new AgentTaskProposalService(agentHarness);
    const agent = new DesktopAgentRuntime(
      input.auth.apiClient, user.id, conversations, resumeDrafts, input.window.webContents,
      input.resumeCompiler, selectedFiles, input.browserAgentController,
      input.browserPageOperator, agentHarness, agentTaskProposals,
      resumes, applications, applicationProposals, deliveryResumeFiles,
      managedResumeUploads, mailConnections,
      interviews, interviewProposals, reminderProposals, experiences, jds, profiles,
      profileProposals, preferences, preferenceProposals, agentHarness.preferenceSuggestions,
      experienceProposals,
      () => readCompactionThreshold(input.auth.apiClient),
      () => runSyncNow(input.auth),
      () => input.auth.privacy.requireCloudBusinessAccess(),
    );
    const { agentTasks, agentTaskScheduler } = await createAgentTaskRuntime(
      agentHarness, agent, input.browserAgentStatus, input.browserPageOperator,
      input.browserAgentController, () => input.browserWindow.open(),
      (taskId) => managedResumeUploads.cleanupTask(taskId));
    return {
      ownerId: user.id,
      apiBaseUrl,
      scopeDigest,
      conversations,
      resumeDrafts,
      resumeConversationLinks,
      resumeDraftEditing: new ResumeDraftEditingService(
        resumeDrafts,
        new ResumeManualEditor(input.resumeCompiler),
      ),
      resumePdfExports,
      agent,
      agentHarness,
      agentTasks,
      agentTaskProposals,
      agentTaskScheduler,
      selectedFiles,
      deliveryResumeFiles,
      managedResumeUploads,
      resumes,
      jds,
      applications,
      applicationProposals,
      experiences,
      profiles,
      profileProposals,
      experienceHistory,
      experienceProposals,
      preferences,
      preferenceProposals,
      trackerDetail,
      interviews,
      interviewProposals,
      notes,
      noteProposals: new NoteProposalService(notes),
      reminders,
      reminderProposals,
      reminderScheduler,
      trackerRecovery: new TrackerRecoveryService(
        syncStore, triggerSync, waitForInitialSync, () => input.auth.syncNow(),
      ),
      mailConnections,
      calendar,
      onboarding,
      onboardingBrowser,
    };
  }
