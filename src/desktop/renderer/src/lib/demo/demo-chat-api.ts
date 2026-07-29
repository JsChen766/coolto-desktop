import type {
  ChatMessage,
  ConversationDetail,
  ConversationSummary,
  DesktopAgentEvent,
  DesktopApi,
  DesktopAttachment,
  ResumeDraftDetail,
} from "@desktop/types";

import { createDemoJdArtifact, createDemoMatchReport } from "./demo-agent-artifacts";

export function createDemoChatApis(draft: ResumeDraftDetail, now: Date) {
  const listeners = new Set<(conversationId: string, event: DesktopAgentEvent) => void>();
  const attachments = new Map<string, DesktopAttachment>();
  let conversations = initialConversations(draft, now);
  const find = (id: string): ConversationDetail => {
    const found = conversations.find((item) => item.id === id);
    if (!found) throw new Error("对话不存在");
    return found;
  };
  const conversationApi: DesktopApi["conversations"] = {
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
        experienceImportArtifacts: [],
        messages: [],
      };
      conversations = [created, ...conversations];
      return structuredClone(created);
    },
    get: async (id) => structuredClone(find(id)),
    rename: async ({ conversationId, title }) => {
      const conversation = find(conversationId);
      conversation.title = title;
      conversation.updatedAt = new Date().toISOString();
      return summary(conversation);
    },
    delete: async (id) => {
      conversations = conversations.filter((item) => item.id !== id);
      attachments.delete(id);
    },
  };
  const attachmentApi: DesktopApi["attachments"] = {
    list: async (id) => {
      const attachment = attachments.get(id);
      return attachment ? [structuredClone(attachment)] : [];
    },
    select: async (id) => {
      find(id);
      const attachment: DesktopAttachment = {
        id: `attachment-${crypto.randomUUID()}`,
        filename: "产品经理简历.docx",
        type: "docx",
        sizeBytes: 84_320,
      };
      attachments.set(id, attachment);
      return structuredClone(attachment);
    },
    remove: async ({ conversationId, fileId }) => {
      if (attachments.get(conversationId)?.id !== fileId) throw new Error("附件不存在");
      attachments.delete(conversationId);
    },
  };
  const agentApi: DesktopApi["agent"] = {
    prompt: async ({ conversationId, text }) => {
      const conversation = find(conversationId);
      conversation.messages.push(message("user", text));
      emit(listeners, conversationId, { type: "run.started" });
      const isMatch = /匹配|分析|比对/iu.test(text);
      const isJd = !isMatch && /jd|岗位|职位描述/iu.test(text);
      const response = isMatch
        ? "已完成匹配分析。综合得分 78 分，技能匹配度高，经验年限有缺口。"
        : isJd
          ? "已识别为岗位描述，提取了 6 条要求。请在左侧确认卡片中审批。"
          : "这是浏览器预览模式。Electron 启动后，这里会接入真实的本地 **Pi Agent**、工具调用与流式 Markdown 输出。";
      for (const part of response.match(/.{1,8}/gu) ?? [response]) {
        emit(listeners, conversationId, { type: "message.delta", text: part });
        await new Promise((resolve) => window.setTimeout(resolve, 25));
      }
      if (isJd) emit(listeners, conversationId, { type: "jd.proposal.created", data: createDemoJdArtifact() });
      if (isMatch) emit(listeners, conversationId, { type: "match.report.created", data: createDemoMatchReport() });
      conversation.messages.push(message("assistant", response));
      conversation.messageCount = conversation.messages.length;
      conversation.updatedAt = new Date().toISOString();
      if (conversation.title === "新对话") conversation.title = text.trim().slice(0, 28) || "新对话";
      emit(listeners, conversationId, { type: "run.completed" });
      return structuredClone(conversation);
    },
    cancel: async () => undefined,
    resolveApproval: async ({ conversationId }) => structuredClone(find(conversationId)),
    onEvent: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return { conversations: conversationApi, attachments: attachmentApi, agent: agentApi };
}

function initialConversations(draft: ResumeDraftDetail, now: Date): ConversationDetail[] {
  return [
    {
      id: crypto.randomUUID(),
      title: "准备产品经理简历",
      createdAt: new Date(now.getTime() - 86_400_000).toISOString(),
      updatedAt: new Date(now.getTime() - 4 * 60_000).toISOString(),
      messageCount: 2,
      resumeArtifacts: [{
        artifactId: draft.artifactId,
        checkpointId: draft.checkpoints[0]?.id ?? null,
        title: draft.title,
        createdAt: draft.updatedAt,
      }],
      experienceImportArtifacts: [],
      messages: [
        message("user", "请根据我的全部经历，帮我准备一份面向 AI 产品经理岗位的简历。", -6),
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
    emptyConversation("整理项目经历", now, 2, 1, 4),
    emptyConversation("英文自我介绍", now, 7, 7, 3),
  ];
}

function emptyConversation(
  title: string,
  now: Date,
  createdDaysAgo: number,
  updatedDaysAgo: number,
  messageCount: number,
): ConversationDetail {
  return {
    id: crypto.randomUUID(),
    title,
    createdAt: new Date(now.getTime() - createdDaysAgo * 86_400_000).toISOString(),
    updatedAt: new Date(now.getTime() - updatedDaysAgo * 86_400_000).toISOString(),
    messageCount,
    resumeArtifacts: [],
    experienceImportArtifacts: [],
    messages: [],
  };
}

function message(role: ChatMessage["role"], content: string, minuteOffset = 0): ChatMessage {
  return { id: crypto.randomUUID(), role, content, createdAt: new Date(Date.now() + minuteOffset * 60_000).toISOString() };
}

function summary(conversation: ConversationDetail): ConversationSummary {
  const {
    messages: _messages,
    resumeArtifacts: _artifacts,
    experienceImportArtifacts: _imports,
    ...rest
  } = conversation;
  return structuredClone(rest);
}

function summaries(items: ConversationDetail[]): ConversationSummary[] {
  return items.map(summary).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function emit(listeners: Set<(id: string, event: DesktopAgentEvent) => void>, id: string, event: DesktopAgentEvent): void {
  listeners.forEach((listener) => listener(id, event));
}
