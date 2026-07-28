import type {
  BrowserState,
  ChatMessage,
  ConversationDetail,
  ConversationSummary,
  DesktopAttachment,
  DesktopAgentEvent,
  DesktopApi,
  JdArtifactData,
  MatchReportArtifactData,
  ResumeLibraryEntry,
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
      requestEmailCode: unavailable,
      verifyEmailCode: unavailable,
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
    library: {
      list: unavailable,
      rename: unavailable,
      archive: unavailable,
      deleteDraft: unavailable,
      getCheckpoints: unavailable,
      restoreCheckpoint: unavailable,
    },
    window: {
      minimize: unavailable,
      toggleMaximize: unavailable,
      close: unavailable,
    },
    browser: {
      open: unavailable,
      close: unavailable,
      navigate: unavailable,
      goBack: unavailable,
      goForward: unavailable,
      reload: unavailable,
      getState: unavailable,
      abortFill: unavailable,
      onStateChanged: () => () => undefined,
      onFillProgress: () => () => undefined,
      onReviewDecision: () => () => undefined,
      onReviewComplete: () => () => undefined,
      onCaptchaDetected: () => () => undefined,
    },
  };
}

const IDLE_BROWSER_STATE: BrowserState = {
  isOpen: false,
  currentUrl: null,
  pageTitle: null,
  isLoading: false,
  canGoBack: false,
  canGoForward: false,
  pageType: "unknown",
  fillStatus: "idle",
};

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
      requestEmailCode: async () => ({
		challengeId: crypto.randomUUID(),
		expiresAt: new Date(Date.now() + 600_000).toISOString(),
		retryAfterSeconds: 60,
	  }),
	  verifyEmailCode: async (email) => {
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
        const isMatch = /匹配|分析|比对/iu.test(text);
        const isJd = !isMatch && /jd|岗位|职位描述/iu.test(text);
        const response = isMatch
          ? "已完成匹配分析。综合得分 78 分，技能匹配度高，经验年限有缺口。"
          : isJd
          ? "已识别为岗位描述，提取了 6 条要求。请在左侧确认卡片中审批。"
          : "这是浏览器预览模式。Electron 启动后，这里会接入真实的本地 **Pi Agent**、工具调用与流式 Markdown 输出。";
        for (const part of response.match(/.{1,8}/gu) ?? [response]) {
          emit(listeners, conversationId, {
            type: "message.delta",
            text: part,
          });
          await new Promise((resolve) => window.setTimeout(resolve, 25));
        }
        if (isJd) {
          emit(listeners, conversationId, {
            type: "jd.proposal.created",
            data: createDemoJdArtifact(),
          });
        }
        if (isMatch) {
          emit(listeners, conversationId, {
            type: "match.report.created",
            data: createDemoMatchReport(),
          });
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
    library: {
      list: async () => createDemoLibraryEntries(),
      rename: async (input) => {
        const entry = createDemoLibraryEntries().find((e) => e.cloud?.resumeId === input.resumeId);
        return { id: input.resumeId, title: input.title } as never;
      },
      archive: async () => ({}) as never,
      deleteDraft: async () => undefined,
      getCheckpoints: async () => createDemoCheckpoints(),
      restoreCheckpoint: async () => ({}) as never,
    },
    window: {
      minimize: async () => undefined,
      toggleMaximize: async () => undefined,
      close: async () => undefined,
    },
    browser: createBrowserDemoNamespace(),
  };
}

function createBrowserDemoNamespace(): DesktopApi["browser"] {
  const listeners = new Set<(state: BrowserState) => void>();
  let state: BrowserState = { ...IDLE_BROWSER_STATE };
  const emit = (): void => {
    for (const listener of listeners) listener(structuredClone(state));
  };
  return {
    open: async (input) => {
      state = {
        ...IDLE_BROWSER_STATE,
        isOpen: true,
        currentUrl: input?.url ?? null,
        pageTitle: input?.url ? null : "Coolto 主页",
      };
      emit();
      return structuredClone(state);
    },
    close: async () => {
      state = { ...IDLE_BROWSER_STATE };
      emit();
    },
    navigate: async ({ url }) => {
      state = { ...state, currentUrl: url, isLoading: true };
      emit();
    },
    goBack: async () => undefined,
    goForward: async () => undefined,
    reload: async () => undefined,
    getState: async () => structuredClone(state),
    abortFill: async () => undefined,
    onStateChanged: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onFillProgress: () => () => undefined,
    onReviewDecision: () => () => undefined,
    onReviewComplete: () => () => undefined,
    onCaptchaDetected: () => () => undefined,
  };
}

function createDemoLibraryEntries(): ResumeLibraryEntry[] {
  const now = new Date().toISOString();
  return [
    {
      entryId: "cloud:resume-001",
      displayTitle: "高级前端工程师简历",
      cloud: {
        resumeId: "resume-001",
        title: "高级前端工程师简历",
        targetRole: "高级前端工程师",
        jdId: "jd-001",
        status: "active" as const,
        contentHash: "hash-aaa",
        updatedAt: new Date(Date.now() - 3_600_000).toISOString(),
      },
      local: {
        artifactId: "741d9167-d87d-4a28-8b78-525d8a0a1017",
        title: "高级前端工程师简历",
        updatedAt: now,
        checkpointCount: 3,
        hasPendingChange: false,
      },
      syncStatus: "local_changes" as const,
      availableOperations: ["open", "rename", "archive", "continue_editing", "export_pdf", "delete_local_draft", "restore_checkpoint"],
    },
    {
      entryId: "cloud:resume-002",
      displayTitle: "AI 产品经理简历",
      cloud: {
        resumeId: "resume-002",
        title: "AI 产品经理简历",
        targetRole: "AI 产品经理",
        jdId: null,
        status: "active" as const,
        contentHash: "hash-bbb",
        updatedAt: new Date(Date.now() - 86_400_000).toISOString(),
      },
      local: null,
      syncStatus: "cloud_only" as const,
      availableOperations: ["open", "rename", "archive", "continue_editing", "export_pdf"],
    },
    {
      entryId: "local:draft-002",
      displayTitle: "英文自我介绍（草稿）",
      cloud: null,
      local: {
        artifactId: "draft-002",
        title: "英文自我介绍（草稿）",
        updatedAt: new Date(Date.now() - 172_800_000).toISOString(),
        checkpointCount: 1,
        hasPendingChange: false,
      },
      syncStatus: "local_only" as const,
      availableOperations: ["open", "delete_local_draft", "restore_checkpoint"],
    },
  ];
}

function createDemoCheckpoints() {
  return [
    {
      id: "cp-1",
      label: "完成生成",
      reason: "generated" as const,
      createdAt: new Date(Date.now() - 7_200_000).toISOString(),
      workspace: {} as never,
    },
    {
      id: "cp-2",
      label: "接受 AI 修改",
      reason: "ai_change_accepted" as const,
      createdAt: new Date(Date.now() - 3_600_000).toISOString(),
      workspace: {} as never,
    },
    {
      id: "cp-3",
      label: "手动修改",
      reason: "manual_edit" as const,
      createdAt: new Date(Date.now() - 1_800_000).toISOString(),
      workspace: {} as never,
    },
  ];
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

function createDemoMatchReport(): MatchReportArtifactData {
  const now = new Date().toISOString();
  return {
    reportId: `match-report-${crypto.randomUUID()}`,
    jdId: "demo-jd-001",
    jdTitle: "高级前端工程师",
    jdCompany: "字节跳动",
    finalScore: 78,
    tier: "good",
    dimensions: [
      { dimension: "skills", score: 85, weight: 0.4, rationale: "React/Vue/TypeScript 均有项目经验" },
      { dimension: "experience", score: 70, weight: 0.35, rationale: "有 3 年经验，岗位要求 5 年" },
      { dimension: "education", score: 80, weight: 0.15, rationale: "计算机本科符合要求" },
      { dimension: "overallImpression", score: 75, weight: 0.1, rationale: "有大型项目背景，沟通能力待核实" },
    ],
    highlights: [
      {
        requirementId: "req-1",
        requirementText: "精通 React/Vue 等主流框架",
        summary: "简历显示主导了多个 React 项目，有完整的组件库建设经验",
        evidence: [{ experienceId: "exp-1", revisionId: "rev-1", revisionContentHash: "abc", sourceQuote: "主导建设组件库，覆盖 30+ 组件，被 3 个产品线复用" }],
      },
      {
        requirementId: "req-2",
        requirementText: "熟悉 TypeScript",
        summary: "项目全面使用 TypeScript，有类型体操经验",
        evidence: [{ experienceId: "exp-1", revisionId: "rev-1", revisionContentHash: "abc", sourceQuote: "全面引入 TypeScript 严格模式，消灭运行时类型错误" }],
      },
    ],
    gaps: [
      {
        requirementId: "req-0",
        requirementText: "5年以上前端开发经验",
        severity: "must_have",
        explanation: "候选人有约 3 年经验，低于岗位要求的 5 年",
        suggestion: "可补充实习或兼职项目以弥补年限差距",
      },
      {
        requirementId: "req-4",
        requirementText: "有性能优化经验者优先",
        severity: "preferred",
        explanation: "简历未提及明确的性能优化成果或指标",
        suggestion: "可增加性能优化相关经历，附数据指标更佳",
      },
    ],
    coverageRatio: 0.67,
    evidenceCompleteness: 0.85,
    generatedAt: now,
    expired: false,
  };
}

function createDemoJdArtifact(): JdArtifactData {
  return {
    proposalId: `jd-proposal-${crypto.randomUUID()}`,
    approvalRequestId: `approval-${crypto.randomUUID()}`,
    title: "高级前端工程师",
    company: "字节跳动",
    targetRole: null,
    requirements: [
      { text: "5年以上前端开发经验", category: "experience", importance: "high" },
      { text: "精通 React/Vue 等主流框架", category: "skill", importance: "high" },
      { text: "熟悉 TypeScript，有大型项目经验", category: "skill", importance: "high" },
      { text: "良好的沟通能力和团队协作精神", category: "skill", importance: "medium" },
      { text: "有性能优化经验者优先", category: "experience", importance: "medium" },
      { text: "计算机相关专业本科及以上学历", category: "education", importance: "high" },
    ],
    status: "pending",
  };
}
