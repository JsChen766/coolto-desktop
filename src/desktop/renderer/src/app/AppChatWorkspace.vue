<script setup lang="ts">
import {
  ApprovalCard,
  ArtifactPanel,
  ChatHeader,
  ChatMessageView,
  Composer,
  EmptyState,
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

const props = defineProps<{ shell: AppShell }>();
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
  openJdPanel,
  openMatchPanel,
  openResumeDraft,
  pendingApproval,
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
        :title="current?.title ?? '新对话'"
        :sidebar-open="sidebarOpen"
        :artifact-open="artifactOpen"
        :browser-open="browser.state.isOpen"
        :resume-draft="resumeWorkspace.activeDraft.value"
        :platform="desktopApi.platform"
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
        @minimize="desktopApi.window.minimize"
        @maximize="desktopApi.window.toggleMaximize"
        @close="desktopApi.window.close"
      />

      <div class="workspace-body">
        <section class="chat-pane">
          <div ref="scroller" class="message-scroller">
            <div v-if="current" class="message-stream">
              <EmptyState
                v-if="current.messages.length === 0 && !running"
                @use-prompt="send"
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
            @send="send"
            @cancel="desktopApi.agent.cancel"
            @select-attachment="conversationAttachment.select"
            @remove-attachment="conversationAttachment.remove"
          />
        </section>

        <ArtifactPanel
          v-if="artifactOpen && activeArtifactType === 'resume'"
          :draft="resumeWorkspace.activeDraft.value"
          :busy="resumeWorkspace.busy.value"
          :error="resumeWorkspace.error.value"
          :local-save-state="resumeWorkspace.localSaveState.value"
          @edit="resumeWorkspace.edit"
          @autosave="resumeWorkspace.autosave"
          @restore="resumeWorkspace.restore"
          @accept="resumeWorkspace.resolvePending('accept')"
          @reject="resumeWorkspace.resolvePending('reject')"
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
