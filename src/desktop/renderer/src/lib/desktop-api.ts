import type {
  ChatMessage,
  ConversationDetail,
  ConversationSummary,
  DesktopAgentEvent,
  DesktopApi,
} from "@desktop/types";

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
  const listeners = new Set<
    (conversationId: string, event: DesktopAgentEvent) => void
  >();
  let currentUser = { id: "preview-user", email: "jians@126.com" };
  let conversations: ConversationDetail[] = [
    {
      id: crypto.randomUUID(),
      title: "准备产品经理简历",
      createdAt: new Date(now.getTime() - 86_400_000).toISOString(),
      updatedAt: new Date(now.getTime() - 4 * 60_000).toISOString(),
      messageCount: 2,
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
      messages: [],
    },
    {
      id: crypto.randomUUID(),
      title: "英文自我介绍",
      createdAt: new Date(now.getTime() - 604_800_000).toISOString(),
      updatedAt: new Date(now.getTime() - 604_800_000).toISOString(),
      messageCount: 3,
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
      },
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
  const { messages: _messages, ...rest } = conversation;
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
