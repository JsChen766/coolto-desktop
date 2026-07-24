import type {
  ChatMessage,
  ConversationDetail,
  ConversationSummary,
  DesktopAttachment,
  DesktopAgentEvent,
  DesktopApi,
  ResumeDraftDetail,
} from "@desktop/types";
import { getResumeFixture } from "../../../../resume/fixtures";

export const desktopApi: DesktopApi =
  window.coolto ??
  (import.meta.env.DEV
    ? createBrowserDemoApi()
    : createUnavailableDesktopApi());

function createUnavailableDesktopApi(): DesktopApi {
  const unavailable = async (): Promise<never> => {
    throw new Error("桌面安全桥接加载失败，请重新启动 Coolto");
  };
  return {
    platform: "darwin",
    auth: {
      getCurrentUser: unavailable,
      login: unavailable,
      logout: unavailable,
    },
    conversations: {
      list: unavailable,
      create: unavailable,
      get: unavailable,
      rename: unavailable,
      delete: unavailable,
    },
    attachments: {
      list: unavailable,
      select: unavailable,
      remove: unavailable,
    },
    resumeDrafts: {
      list: unavailable,
      get: unavailable,
      edit: unavailable,
      restore: unavailable,
      accept: unavailable,
      reject: unavailable,
    },
    agent: {
      prompt: unavailable,
      cancel: unavailable,
      resolveApproval: unavailable,
      onEvent: () => () => undefined,
    },
    window: {
      minimize: unavailable,
      toggleMaximize: unavailable,
      close: unavailable,
    },
  };
}

function createBrowserDemoApi(): DesktopApi {
  const now = new Date();
  const demoDraft = createDemoDraft(now);
  const listeners = new Set<
    (conversationId: string, event: DesktopAgentEvent) => void
  >();
  let currentUser = { id: "preview-user", email: "preview@example.com" };
  const demoAttachments = new Map<string, DesktopAttachment>();
  let conversations: ConversationDetail[] = [
    {
      id: crypto.randomUUID(),
      title: "准备产品经理简历",
      createdAt: new Date(now.getTime() - 86_400_000).toISOString(),
      updatedAt: new Date(now.getTime() - 4 * 60_000).toISOString(),
      messageCount: 2,
      resumeArtifacts: [
        {
          artifactId: demoDraft.artifactId,
          checkpointId: demoDraft.checkpoints[0]?.id ?? null,
          title: demoDraft.title,
          createdAt: demoDraft.updatedAt,
        },
      ],
      messages: [
        message(
          "user",
          "请根据我的全部经历，帮我准备一份面向 AI 产品经理岗位的简历。",
          -6,
        ),
        message(
          "assistant",
          [
            "我已经读取了你的经历。建议这份简历突出三个方向：",
            "",
            "- **AI 产品落地**：从需求分析到上线验证的完整闭环",
            "- **跨团队协作**：协调工程、设计与业务团队推进项目",
            "- **量化结果**：优先使用有明确规模和成果的数据",
            "",
            "接下来我需要你选择目标 JD，或者直接粘贴职位描述。",
          ].join("\n"),
          -5,
        ),
      ],
    },
    {
      id: crypto.randomUUID(),
      title: "整理项目经历",
      createdAt: new Date(now.getTime() - 172_800_000).toISOString(),
      updatedAt: new Date(now.getTime() - 86_400_000).toISOString(),
      messageCount: 4,
      resumeArtifacts: [],
      messages: [],
    },
    {
      id: crypto.randomUUID(),
      title: "英文自我介绍",
      createdAt: new Date(now.getTime() - 604_800_000).toISOString(),
      updatedAt: new Date(now.getTime() - 604_800_000).toISOString(),
      messageCount: 3,
      resumeArtifacts: [],
      messages: [],
    },
  ];

  const find = (conversationId: string): ConversationDetail => {
    const conversation = conversations.find(
      (candidate) => candidate.id === conversationId,
    );
    if (!conversation) {
      throw new Error("对话不存在");
    }
    return conversation;
  };

  return {
    platform: "darwin",
    auth: {
      getCurrentUser: async () => currentUser,
      login: async (email) => {
        currentUser = { id: "preview-user", email };
        return currentUser;
      },
      logout: async () => undefined,
    },
    conversations: {
      list: async () => summaries(conversations),
      create: async () => {
        const timestamp = new Date().toISOString();
        const created: ConversationDetail = {
          id: crypto.randomUUID(),
          title: "新对话",
          createdAt: timestamp,
          updatedAt: timestamp,
          messageCount: 0,
          resumeArtifacts: [],
          messages: [],
        };
        conversations = [created, ...conversations];
        return structuredClone(created);
      },
      get: async (conversationId) => structuredClone(find(conversationId)),
      rename: async ({ conversationId, title }) => {
        const conversation = find(conversationId);
        conversation.title = title;
        conversation.updatedAt = new Date().toISOString();
        return summary(conversation);
      },
      delete: async (conversationId) => {
        conversations = conversations.filter(
          (candidate) => candidate.id !== conversationId,
        );
        demoAttachments.delete(conversationId);
      },
    },
    attachments: {
      list: async (conversationId) => {
        const attachment = demoAttachments.get(conversationId);
        return attachment ? [structuredClone(attachment)] : [];
      },
      select: async (conversationId) => {
        find(conversationId);
        const attachment: DesktopAttachment = {
          id: `attachment-${crypto.randomUUID()}`,
          filename: "产品经理简历.docx",
          type: "docx",
          sizeBytes: 84_320,
        };
        demoAttachments.set(conversationId, attachment);
        return structuredClone(attachment);
      },
      remove: async ({ conversationId, fileId }) => {
        const attachment = demoAttachments.get(conversationId);
        if (attachment?.id !== fileId) throw new Error("附件不存在");
        demoAttachments.delete(conversationId);
      },
    },
    resumeDrafts: {
      list: async () => [draftSummary(demoDraft)],
      get: async (artifactId) => {
        if (artifactId !== demoDraft.artifactId) {
          throw new Error("本地简历草稿不存在");
        }
        return structuredClone(demoDraft);
      },
      edit: async ({ artifactId, target, text, createCheckpoint }) => {
        if (artifactId !== demoDraft.artifactId) {
          throw new Error("本地简历草稿不存在");
        }
        if (target.type === "bullet") {
          const bullet = demoDraft.structure.sections
            .flatMap((section) => section.items)
            .flatMap((item) => item.bullets)
            .find((candidate) => candidate.id === target.bulletId);
          if (bullet) bullet.text = text.trim();
        } else {
          const item = demoDraft.structure.sections
            .flatMap((section) => section.items)
            .find((candidate) => candidate.id === target.itemId);
          if (item) item.raw_text = text.trim();
        }
        demoDraft.updatedAt = new Date().toISOString();
        demoDraft.cloudState = "local_changes";
        demoDraft.quality.factIntegrity = "needs_review";
        if (createCheckpoint !== false) {
          demoDraft.checkpoints.push({
            id: crypto.randomUUID(),
            label: "手动修改",
            reason: "manual_edit",
            createdAt: demoDraft.updatedAt,
            revision: demoDraft.checkpoints.length + 1,
          });
        }
        return structuredClone(demoDraft);
      },
      restore: async ({ artifactId, checkpointId }) => {
        if (
          artifactId !== demoDraft.artifactId ||
          !demoDraft.checkpoints.some((item) => item.id === checkpointId)
        ) {
          throw new Error("本地简历版本不存在");
        }
        demoDraft.updatedAt = new Date().toISOString();
        return structuredClone(demoDraft);
      },
      accept: async () => structuredClone(demoDraft),
      reject: async () => structuredClone(demoDraft),
    },
    agent: {
      prompt: async ({ conversationId, text }) => {
        const conversation = find(conversationId);
        conversation.messages.push(message("user", text));
        emit(listeners, conversationId, { type: "run.started" });
        const response =
          "这是浏览器预览模式。Electron 启动后，这里会接入真实的本地 **Pi Agent**、工具调用与流式 Markdown 输出。";
        for (const part of response.match(/.{1,8}/gu) ?? [response]) {
          emit(listeners, conversationId, {
            type: "message.delta",
            text: part,
          });
          await new Promise((resolve) => window.setTimeout(resolve, 25));
        }
        conversation.messages.push(message("assistant", response));
        conversation.messageCount = conversation.messages.length;
        conversation.updatedAt = new Date().toISOString();
        if (conversation.title === "新对话") {
          conversation.title = text.trim().slice(0, 28) || "新对话";
        }
        emit(listeners, conversationId, { type: "run.completed" });
        return structuredClone(conversation);
      },
      cancel: async () => undefined,
      resolveApproval: async ({ conversationId }) =>
        structuredClone(find(conversationId)),
      onEvent: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    window: {
      minimize: async () => undefined,
      toggleMaximize: async () => undefined,
      close: async () => undefined,
    },
  };
}

function createDemoDraft(now: Date): ResumeDraftDetail {
  const structure = getResumeFixture("zh-qualified");
  const bullets = structure.sections.flatMap((section) =>
    section.items.flatMap((item) => item.bullets),
  );
  const updatedAt = new Date(now.getTime() - 3 * 60_000).toISOString();
  return {
    artifactId: "741d9167-d87d-4a28-8b78-525d8a0a1017",
    title: "AI 产品经理简历",
    conversationIds: [],
    updatedAt,
    checkpointCount: 1,
    hasPendingChange: false,
    cloudState: "local_only",
    structure,
    compileResult: {
      templateId: "resume-standard",
      profileVersion: structure.layout_profile_version,
      profileHash: structure.layout_profile_hash,
      qualified: true,
      fontsReady: true,
      loadedFontFamilies: ["SimSun", "Times New Roman"],
      observedAt: updatedAt,
      viewport: { widthPx: 1280, heightPx: 820, devicePixelRatio: 1 },
      pageCount: 1,
      overflowPx: 0,
      usedHeightPx: 923,
      availableHeightPx: 1000,
      bodyLineHeightPx: 15.34,
      usageRatio: 0.923,
      effectiveTargetBand: { minimum: 0.85, target: 0.92, maximum: 0.98 },
      bullets: bullets.map((bullet, index) => ({
        bulletId: bullet.id,
        lineCount: 2,
        lastLineWidthPx: 470 + (index % 4) * 12,
        availableLineWidthPx: 600,
        lastLineRatio: (470 + (index % 4) * 12) / 600,
        passed: true,
      })),
      violations: [],
    },
    workspaceStatus: "ready_for_approval",
    quality: {
      pageUsageRatio: 0.923,
      minimumBulletTailRatio: 470 / 600,
      factIntegrity: "passed",
      jdCoverage: { covered: 7, total: 8, ratio: 0.875 },
    },
    checkpoints: [
      {
        id: "4514605d-b3f6-4cad-ab22-c99782aee0ad",
        label: "完成生成",
        reason: "generated",
        createdAt: updatedAt,
        revision: 12,
      },
    ],
    pendingChange: null,
  };
}

function draftSummary(draft: ResumeDraftDetail) {
  const {
    structure: _structure,
    compileResult: _compileResult,
    workspaceStatus: _workspaceStatus,
    quality: _quality,
    checkpoints: _checkpoints,
    pendingChange: _pendingChange,
    ...summary
  } = draft;
  return structuredClone(summary);
}

function message(
  role: ChatMessage["role"],
  content: string,
  minuteOffset = 0,
): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: new Date(Date.now() + minuteOffset * 60_000).toISOString(),
  };
}

function summary(conversation: ConversationDetail): ConversationSummary {
  const {
    messages: _messages,
    resumeArtifacts: _resumeArtifacts,
    ...rest
  } = conversation;
  return structuredClone(rest);
}

function summaries(
  conversations: ConversationDetail[],
): ConversationSummary[] {
  return conversations
    .map(summary)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function emit(
  listeners: Set<
    (conversationId: string, event: DesktopAgentEvent) => void
  >,
  conversationId: string,
  event: DesktopAgentEvent,
): void {
  listeners.forEach((listener) => listener(conversationId, event));
}
