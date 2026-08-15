<script setup lang="ts">
import {
  ApprovalCard,
  ChatHeader,
  ChatMessageView,
  Composer,
  EmptyState,
  ExperienceImportResultCard,
  FillProgressCard,
  JdArtifactCard,
  JdDetailPanel,
  MarkdownContent,
  MatchReportCard,
  MatchReportPanel,
  ResumeArtifactCard,
  ToolActivity,
} from "./app-components";
import type { AppShell } from "./use-app-shell";
import { useEmptyStateStages } from "./use-empty-state-stages";
import ResumePreviewOutlet from "./ResumePreviewOutlet.vue";

const props = defineProps<{ shell: AppShell }>();
const emptyStages = useEmptyStateStages();
const {
  activeArtifactType,
  activeJd,
  activeMatchReport,
  approvalBusy,
  artifactOpen,
  browser,
  conversationAttachment,
  current,
  desktopApi,
  draftCloudState,
  exportResume,
  fillProgress,
  jdArtifacts,
  matchReports,
  openDialog,
  openExperienceImportResult,
  openJdPanel,
  openMatchPanel,
  openPrimaryView,
  openResumeDraft,
  openTracker,
  pendingApproval,
  cloudCopyRequested,
  clearResumeOperationContext,
  requestCloudResumeCopy,
  resumeOperationContext,
  resolveApproval,
  resumeWorkspace,
  runError,
  running,
  saveResumeToCloud,
  scroller,
  send,
  sidebarOpen,
  streamingText,
  toggleArtifact,
  toggleBrowser,
  toolRuns,
} = props.shell;
</script>

<template>
      <ChatHeader
        :title="!current || current.title === '新对话' ? $t('新对话') : current.title"
        :sidebar-open="sidebarOpen"
        :artifact-open="artifactOpen"
        :browser-open="browser.state.isOpen"
        :resume-draft="resumeWorkspace.activeDraft.value"
        :exporting="resumeWorkspace.exporting.value"
        :export-message="resumeWorkspace.exportMessage.value"
        @toggle-sidebar="sidebarOpen = !sidebarOpen"
        @toggle-artifact="toggleArtifact"
        @toggle-browser="toggleBrowser"
        @save-resume="saveResumeToCloud"
        @export-resume="exportResume"
        @rename="
          current &&
          openDialog('rename', {
            id: current.id,
            title: current.title,
            createdAt: current.createdAt,
            updatedAt: current.updatedAt,
            messageCount: current.messageCount,
          })
        "
      />

      <div class="workspace-body">
        <section class="chat-pane">
          <div ref="scroller" class="message-scroller">
            <div v-if="current" class="message-stream">
              <EmptyState
                v-if="current.messages.length === 0 && !running"
                :stage="emptyStages.stage.value"
                @use-prompt="send"
                @open-experiences="openPrimaryView('experiences')"
                @open-library="openPrimaryView('library')"
                @open-tracker="openTracker"
                @open-browser="toggleBrowser"
                @import-resume="conversationAttachment.select"
              />
              <template v-for="message in current.messages" :key="message.id">
                <ChatMessageView :message="message" />
                <ResumeArtifactCard
                  v-for="artifact in current.resumeArtifacts.filter(
                    (item) => item.anchorMessageId === message.id,
                  )"
                  :key="artifact.artifactId"
                  :artifact="artifact"
                  :cloud-state="draftCloudState(artifact.artifactId)"
                  @open="openResumeDraft"
                />
                <JdArtifactCard
                  v-for="jdArtifact in jdArtifacts.filter(
                    (item) => item.anchorMessageId === message.id,
                  )"
                  :key="jdArtifact.proposalId"
                  :artifact="jdArtifact"
                  @open="openJdPanel"
                />
                <MatchReportCard
                  v-for="report in matchReports.filter(
                    (item) => item.anchorMessageId === message.id,
                  )"
                  :key="report.reportId"
                  :report="report"
                  @open="openMatchPanel"
                />
                <ExperienceImportResultCard
                  v-for="artifact in current.experienceImportArtifacts.filter(
                    (item) => item.anchorMessageId === message.id,
                  )"
                  :key="artifact.proposalId"
                  :artifact="artifact"
                  @open="openExperienceImportResult(current.id, $event)"
                />
              </template>
              <article
                v-if="toolRuns.length || streamingText"
                class="chat-message role-assistant live-response"
              >
                <ToolActivity :runs="toolRuns" />
                <MarkdownContent
                  v-if="streamingText"
                  :content="streamingText"
                />
                <span v-if="running" class="stream-caret" aria-hidden="true" />
              </article>
              <ResumeArtifactCard
                v-for="artifact in current.resumeArtifacts.filter(
                  (item) => !item.anchorMessageId,
                )"
                :key="artifact.artifactId"
                :artifact="artifact"
                :cloud-state="draftCloudState(artifact.artifactId)"
                @open="openResumeDraft"
              />
              <JdArtifactCard
                v-for="jdArtifact in jdArtifacts.filter(
                  (item) => !item.anchorMessageId,
                )"
                :key="jdArtifact.proposalId"
                :artifact="jdArtifact"
                @open="openJdPanel"
              />
              <MatchReportCard
                v-for="report in matchReports.filter(
                  (item) => !item.anchorMessageId,
                )"
                :key="report.reportId"
                :report="report"
                @open="openMatchPanel"
              />
              <ExperienceImportResultCard
                v-for="artifact in current.experienceImportArtifacts.filter(
                  (item) => !item.anchorMessageId,
                )"
                :key="artifact.proposalId"
                :artifact="artifact"
                @open="openExperienceImportResult(current.id, $event)"
              />
              <p v-if="runError" class="run-error">{{ runError }}</p>
              <ApprovalCard
                v-if="pendingApproval"
                :request="pendingApproval"
                :busy="approvalBusy"
                @decide="resolveApproval"
              />
              <FillProgressCard
                :records="fillProgress.records.value"
                :reviewing="fillProgress.reviewing.value"
                :pending-count="fillProgress.pendingCount.value"
                :accepted-count="fillProgress.acceptedCount.value"
                :rejected-count="fillProgress.rejectedCount.value"
                :last-outcome="fillProgress.lastOutcome.value"
                :captcha="fillProgress.captcha.value"
                @abort="fillProgress.abortFill"
                @dismiss-outcome="fillProgress.dismissOutcome"
                @dismiss-captcha="fillProgress.dismissCaptcha"
              />
            </div>
          </div>
          <Composer
            :disabled="!current"
            :running="running"
            :attachment="conversationAttachment.attachment.value"
            :attachment-busy="conversationAttachment.selecting.value"
            :attachment-error="conversationAttachment.error.value"
            :resume-context="resumeOperationContext"
            :cloud-copy-requested="cloudCopyRequested"
            @send="send"
            @cancel="desktopApi.agent.cancel"
            @select-attachment="conversationAttachment.select"
            @remove-attachment="conversationAttachment.remove"
            @clear-resume-context="clearResumeOperationContext"
            @request-local-copy="requestCloudResumeCopy"
          />
        </section>

        <ResumePreviewOutlet
          v-if="artifactOpen && activeArtifactType === 'resume'"
          :shell="shell"
        />
        <JdDetailPanel
          v-else-if="artifactOpen && activeArtifactType === 'jd' && activeJd"
          :data="activeJd"
        />
        <MatchReportPanel
          v-else-if="artifactOpen && activeArtifactType === 'match' && activeMatchReport"
          :data="activeMatchReport"
        />
      </div>

</template>
