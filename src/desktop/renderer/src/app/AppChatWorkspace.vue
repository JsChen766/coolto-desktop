<script setup lang="ts">
import { computed } from "vue";
import type { ChatMessage } from "@desktop/types";
import {
  ChatComposerHost, ChatHeader, ChatPendingAction, ChatRunTerminal,
  ChatMessageView,
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
import { useStreamingElapsed } from "../chat/use-streaming-elapsed";
import { useEmptyStateStages } from "./use-empty-state-stages";
import ResumePreviewOutlet from "./ResumePreviewOutlet.vue";
import { publishComposerDraft } from "../chat/composer-draft-channel";
const props = defineProps<{
  shell: AppShell;
  composerDisabled?: boolean;
  composerGuided?: boolean;
  composerGuidedText?: string | undefined;
  composerGuidedHighlight?: boolean;
}>();
defineEmits<{
  composerFocus: [];
  composerSend: [text: string];
}>();
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
  openTracker, importDeliveryResumeFile,
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
/** 合并附件实时状态到消息卡片；liveVersion 保证事件到来时重渲染。 */
const messagesWithLiveStatus = computed<ChatMessage[]>(() => {
  void conversationAttachment.liveVersion.value;
  const detail = current.value;
  if (!detail) return [];
  return detail.messages.map((message) =>
    !message.attachments?.length ? message : {
      ...message,
      attachments: message.attachments.map((a) => ({ ...a, status: conversationAttachment.liveStatusFor(detail.id, a.fileId) ?? a.status })),
    },
  );
});
const { elapsed: streamingElapsed } = useStreamingElapsed(props.shell.running);
const GENERAL_RESUME_PROMPT = "请基于我的全部经历生成一份不关联任何 JD 的高质量一页通用简历。";
function continueLastRun(): void { void send("请继续完成刚才未完成的任务；从已保留的有效进度继续，如果缺少信息只问一个具体问题。"); }
function restartLastRun(): void { void send("请重新开始刚才的任务，重新检查当前资料后执行；不要复用失败的中间状态。"); }
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
        :saving-to-library="resumeWorkspace.savingToLibrary.value"
        :save-message="resumeWorkspace.saveMessage.value"
        :line-spacing-percent="resumeWorkspace.lineSpacing.percent.value" :line-spacing-maximum="resumeWorkspace.lineSpacing.maximumPercent.value" :line-spacing-saving="resumeWorkspace.lineSpacing.saving.value"
        @toggle-sidebar="sidebarOpen = !sidebarOpen"
        @toggle-artifact="toggleArtifact"
        @toggle-browser="toggleBrowser"
        @save-resume="saveResumeToCloud"
        @export-resume="exportResume"
        @preview-line-spacing="resumeWorkspace.lineSpacing.preview" @commit-line-spacing="resumeWorkspace.lineSpacing.commit"
        @rename="current && openDialog('rename', { id: current.id, title: current.title, createdAt: current.createdAt, updatedAt: current.updatedAt, messageCount: current.messageCount })"
      />
      <div class="workspace-body">
        <section class="chat-pane">
          <div ref="scroller" class="message-scroller">
            <div v-if="current" class="message-stream">
              <EmptyState
                v-if="current.messages.length === 0 && !running"
                :stage="emptyStages.stage.value"
                @draft-prompt="publishComposerDraft"
                @use-prompt="send"
                @open-experiences="openPrimaryView('experiences')"
                @open-library="openPrimaryView('library')"
                @open-tracker="openTracker"
                @open-browser="toggleBrowser"
                @import-resume="conversationAttachment.select" @save-delivery-resume="importDeliveryResumeFile"
              />
              <template v-for="message in messagesWithLiveStatus" :key="message.id">
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
                  @generate-general="send(GENERAL_RESUME_PROMPT)"
                />
              </template>
              <ChatRunTerminal v-if="current.lastRun && current.lastRun.status !== 'completed' && !running && !runError" :terminal="current.lastRun" @continue="continueLastRun" @restart="restartLastRun" @open-draft="openResumeDraft" />
              <article
                v-if="toolRuns.length || streamingText"
                class="chat-message role-assistant live-response"
                data-testid="chat-live-response"
              >
                <ToolActivity :runs="toolRuns" />
                <MarkdownContent
                  v-if="streamingText"
                  :content="streamingText"
                />
                <span v-if="running" class="stream-status"><span class="stream-dot" aria-hidden="true" /><span class="stream-elapsed">{{ streamingElapsed }}</span></span>
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
                @generate-general="send(GENERAL_RESUME_PROMPT)"
              />
              <p v-if="runError" class="run-error" data-testid="chat-run-error">{{ runError }}</p>
              <ChatPendingAction
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
          <ChatComposerHost
            :shell="shell"
            :disabled="composerDisabled || !current"
            :guided="composerGuided"
            :guided-text="composerGuidedText"
            :guided-highlight="composerGuidedHighlight"
            @guided-focus="$emit('composerFocus')"
            @guided-send="$emit('composerSend', $event)"
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
