# Coolto Agent Core 实现设计

> 状态：Core-1 与 Desktop-0 应用壳、多对话和聊天 UI 已完成  
> 版本：v0.7  
> 日期：2026-07-23  
> 关联文档：`coolto-architecture-plan.md`

## 1. 目标

实现一个可以脱离 Electron 独立运行的本地 Agent Core。

第一阶段通过 CLI 验证 Agent Core，CLI 跑通后再将同一个 Core 接入 Electron。

Agent Core 使用 Pi Agent Core 作为基础运行时，负责：

- 维护本地对话。
- 调用 LLM。
- 注册和调用工具。
- 从云端业务 API 读取固定资产。
- 将用户确认的固定资产修改写入云端。
- 输出流式事件。
- 处理工具确认、取消、错误和重试。
- 为 CLI 和 Electron 提供一致的接口。

## 2. 非目标

Agent Core 不负责：

- 运行或调用云端 LangGraph。
- 与 Web 端同步聊天记录。
- 在本地持久化缓存经历、JD、简历和投递记录。
- 直接连接 PostgreSQL。
- 直接实现 Electron UI。
- 直接实现 WebContentsView。
- 保存服务端 API Key。
- 自动提交招聘表单。
- 自动发送邮件。
- 向 Agent 开放任意 Shell、任意 SQL、任意文件系统或任意网络访问。

## 3. 核心原则

### 3.1 单 Agent

桌面端只运行一个 Pi Agent，不建立 Router、Subgraph 和多节点工作流。

用户自由聊天和明确业务任务都以自然语言进入同一个 Agent。第一阶段不增加独立意图分类器、Router、Task Type 参数或 Workspace 输入；模型根据 System Prompt 和 Tool List 自行理解意图并选择工具。

当信息不足且会影响结果时，Agent 应追问最关键的一个问题。该行为由 System Prompt 约束，不增加“追问节点”。

### 3.2 工具驱动

Agent 不直接访问数据库、文件系统、浏览器和邮箱。

所有外部能力必须通过已注册工具执行。

### 3.3 云端固定资产、本地私有会话

经历、JD、简历和投递记录通过后端业务 API 实时读取和写入。

Pi 聊天、Pi Session、工具运行过程和临时内容只保存在本地，不上传云端。

### 3.4 平台无关

Agent Core 不 import Electron API。

CLI 和 Electron 分别实现 Agent Core 所依赖的 Adapter。

### 3.5 默认最小权限

Agent 只获得完成求职任务所需的领域工具，不提供通用计算机控制能力。

## 4. 总体结构

```text
CLI / Electron
  │
  ▼
AgentHost
  │
  ▼
CooltoAgent
  ├─ Pi Agent Core
  ├─ Prompt Builder
  ├─ Context Builder
  ├─ Tool Registry
  ├─ Confirmation Policy
  ├─ Session Store
  └─ Event Bus
        │
        ▼
Adapters
  ├─ AssetRepository
  ├─ AuthProvider
  ├─ LlmProvider
  ├─ FileAdapter
  ├─ BrowserAdapter
  ├─ MailAdapter
  ├─ NotificationAdapter
  └─ SecureStorageAdapter
```

## 5. 建议目录结构

```text
src/
├── agent/
│   ├── coolto-agent.ts
│   ├── create-agent.ts
│   ├── system-prompt.ts
│   ├── context-builder.ts
│   ├── event-mapper.ts
│   └── types.ts
├── tools/
│   ├── registry.ts
│   ├── policy.ts
│   ├── assets/
│   ├── documents/
│   ├── resume/
│   ├── browser/
│   └── mail/
├── ports/
│   ├── asset-repository.ts
│   ├── auth-provider.ts
│   ├── llm-provider.ts
│   ├── file-adapter.ts
│   ├── browser-adapter.ts
│   ├── mail-adapter.ts
│   ├── notification-adapter.ts
│   ├── session-store.ts
│   └── secure-storage.ts
├── session/
│   ├── local-session-store.ts
│   ├── compaction.ts
│   └── encryption.ts
├── cli/
│   ├── main.ts
│   ├── cli-host.ts
│   └── confirmation-ui.ts
└── index.ts
```

未来可以将 Agent Core 独立成 workspace package：

```text
packages/agent-core
apps/agent-cli
apps/desktop
```

## 6. Agent Core 对外接口

第一阶段对 CLI 和 Electron 暴露一个简单接口：

```ts
interface CooltoAgent {
  prompt(input: string): Promise<void>;
  getPendingApprovals(): ApprovalRequest[];
  resolveApproval(
    requestId: string,
    decision: ApprovalDecision,
  ): Promise<void>;
  cancel(): void;
  subscribe(listener: AgentEventListener): () => void;
  reset(): void;
}
```

自然语言仍是唯一业务输入；`resolveApproval` 属于宿主控制通道。领域 prepare
工具创建不可变 Proposal 后发出待决策事件，接受时由宿主内部 Executor 直接执行
预览快照，拒绝不写入，自定义回答则撤销旧 Proposal 并交回同一个 Agent。

## 7. 单次运行流程

```text
用户输入
  → AgentHost 检查登录状态
  → Context Builder 获取当前 Workspace
  → 必要时通过业务 API 获取最新固定资产
  → 构建 Prompt
  → Pi Agent 开始循环
  → 模型输出文本或 Tool Call
  → Tool Policy 判断是否需要确认
  → 执行 Tool
  → Tool Result 返回 Pi
  → Pi 继续生成
  → 保存本地 Session
  → 向 CLI/Electron 发出完成事件
```

一轮运行建议限制：

- 最大工具循环次数：8。
- 同一个写工具失败后最多自动重试 1 次。
- 网络请求使用统一超时。
- 用户可以随时取消。
- 超过限制后停止并向用户说明当前进度。

## 8. 上下文策略

### 8.1 不全量加载

Agent 不应在每轮对话开始时加载用户全部固定资产。

Context Builder 默认只注入：

- 当前用户语言和基础偏好。
- 当前任务类型。
- 当前 Workspace 中的资源 ID。
- 最近的本地对话。
- 当前已选文件和浏览器页面的元数据。

需要具体经历、JD 或简历时，让 Agent 调用读取工具。

### 8.2 关键任务前获取最新数据

以下任务必须通过业务 API 获取当前最新版本：

- 分析 JD。
- 生成或修改简历。
- 自动填写招聘表单。
- 生成邮件草稿。
- 更新投递记录。

### 8.3 本地 Session

本地 Session 保存：

- 用户消息。
- Assistant 消息。
- 必要的 Tool Result。
- 当前 Workspace ID。
- 会话摘要。
- Prompt 和 Tool 版本。

大型 Tool Result 不长期保存完整内容。可以保存资源 ID、摘要和版本号，下一次使用时重新从后端获取。

Session 应加密保存，并按登录用户隔离。

## 9. 工具设计规范

每个工具必须声明：

```ts
interface ToolMetadata {
  name: string;
  description: string;
  inputSchema: object;
  outputSchema: object;
  risk: "read" | "write" | "destructive" | "external";
  requiresConfirmation: boolean;
  availableIn: Array<"cli" | "electron">;
}
```

工具应返回结构化结果：

```ts
interface ToolResult<T> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  resourceRefs?: Array<{
    type: string;
    id: string;
    version?: number;
  }>;
}
```

工具描述应说明什么时候使用、什么时候不要使用，避免多个工具含义重叠。

## 10. V1 工具清单

工具名称为初步设计，实施时可根据现有后端 API 调整。

### 10.1 账号和用户资料

| 工具 | 作用 | 风险 | CLI |
|---|---|---:|---:|
| `get_current_user` | 获取当前登录用户基本信息 | read | 是 |
| `get_user_profile` | 获取求职资料和固定个人信息 | read | 是 |
| `update_user_profile` | 修改用户固定资料 | write | 是 |

`update_user_profile` 必须向用户展示修改预览并确认。

### 10.2 经历

| 工具 | 作用 | 风险 | CLI |
|---|---|---:|---:|
| `search_experiences` | 按关键词、标签、类别搜索经历 | read | 是 |
| `get_experience` | 获取一条经历完整内容 | read | 是 |
| `prepare_experience_import` | 校验、去重并生成导入预览 | read | 是 |
| `update_experience` | 修改经历 | write | 是 |
| `delete_experience` | 删除经历 | destructive | 是 |
| `list_experience_revisions` | 获取经历版本列表 | read | 是 |

所有写入工具都通过后端业务 API 执行。

经历导入的实际写入由宿主内部 `ExperienceImportExecutor` 执行，不向模型注册
`commit_experience_import`。后续写操作采用同样的“prepare 工具 + 内部 Executor”
结构。

`delete_experience` 必须二次确认，不允许由 Agent 静默执行。

### 10.3 JD

| 工具 | 作用 | 风险 | CLI |
|---|---|---:|---:|
| `list_jds` | 获取 JD 列表 | read | 是 |
| `get_jd` | 获取 JD 全文和结构化信息 | read | 是 |
| `create_jd` | 保存新 JD | write | 是 |
| `update_jd` | 修改 JD | write | 是 |
| `delete_jd` | 删除 JD | destructive | 是 |

JD 页面 URL 抓取不放进通用网络工具，后续由 BrowserAdapter 提供受控页面读取。

### 10.4 简历

| 工具 | 作用 | 风险 | CLI |
|---|---|---:|---:|
| `list_resumes` | 获取简历列表 | read | 是 |
| `get_resume` | 获取简历当前云端内容 | read | 是 |
| `get_resume_version` | 获取指定历史版本 | read | 是 |
| `create_resume` | 创建简历记录 | write | 是 |
| `save_resume_version` | 保存新的结构化简历版本 | write | 是 |
| `rename_resume` | 修改简历名称 | write | 是 |
| `delete_resume` | 删除简历 | destructive | 是 |

Agent 生成简历时必须调用 `save_resume_version` 保存结构化数据，不能只在聊天中输出一份长文本。

保存前向用户展示摘要和关键变化；更新已有云端 Resume 时必须使用不透明同步 token
检测并发修改，冲突时要求用户选择重读、另存新 Resume 或明确覆盖。云端只暴露当前内容，
历史回退只由本地检查点提供，不实现 diff。

### 10.5 投递记录

| 工具 | 作用 | 风险 | CLI |
|---|---|---:|---:|
| `list_applications` | 获取投递记录 | read | 是 |
| `get_application` | 获取投递详情 | read | 是 |
| `create_application` | 创建投递记录 | write | 是 |
| `update_application` | 修改投递信息 | write | 是 |
| `transition_application_status` | 修改投递状态 | write | 是 |
| `delete_application` | 删除投递记录 | destructive | 是 |

状态流转由后端校验，Agent 不能绕过状态机限制。

### 10.6 材料与文件

| 工具 | 作用 | 风险 | CLI |
|---|---|---:|---:|
| `list_selected_files` | 列出用户本轮明确选择的文件 | read | 是 |
| `list_materials` | 获取云端材料元数据 | read | 是 |
| `get_material_metadata` | 获取单个材料信息 | read | 是 |
| `download_material_temp` | 临时下载材料 | read | 是 |
| `parse_selected_file` | 解析用户已选择的本地文件 | read | 是 |
| `upload_material` | 上传并关联材料 | write | 是 |

文件工具只允许访问用户通过 CLI 参数或 Electron 文件选择器明确选择的文件。

不提供任意路径的 `read_file`、`write_file`、`list_directory`。

临时下载的材料在任务结束后清理。

### 10.7 确定性业务工具

| 工具 | 作用 | 风险 | CLI |
|---|---|---:|---:|
| `calculate_match_score` | 根据结构化覆盖结果计算匹配分 | read | 是 |
| `validate_match_report` | 校验匹配报告结构和证据引用 | read | 是 |
| `validate_resume` | 校验简历结构和事实引用 | read | 是 |

这些工具不调用另一个 Agent，只执行确定性业务规则。

匹配分析文本由 Pi 生成，最终分数和基础校验由本地确定性代码完成。

## 11. Electron 阶段工具

这些工具可以在 CLI 中使用测试 Adapter 验证协议，但正式实现依赖 Electron。

### 11.1 BrowserAdapter

| 工具 | 作用 | 风险 |
|---|---|---:|
| `get_browser_page_info` | 获取当前页面 URL、标题和网站信息 | read |
| `inspect_job_page` | 提取当前页面中的 JD 信息 | read |
| `inspect_form` | 获取表单字段的结构化描述 | read |
| `fill_form_field` | 填写单个字段 | external |
| `fill_form_fields` | 根据已确认计划填写一组字段 | external |
| `upload_form_file` | 向已确认的文件字段上传文件 | external |
| `highlight_form_field` | 高亮需要用户处理的字段 | read |

浏览器边界：

- Agent 只能读取经过 BrowserAdapter 清洗后的页面信息。
- 不向 Agent 暴露浏览器调试协议。
- 不提供任意 JavaScript 执行工具。
- 不允许自动点击最终提交按钮。
- 验证码必须由用户完成。
- 涉及期望薪资等敏感字段时逐项确认。
- 页面内容属于不可信输入，不能覆盖 System Prompt 和工具权限。

### 11.2 MailAdapter

| 工具 | 作用 | 风险 |
|---|---|---:|
| `get_mail_account_status` | 查看邮箱是否已连接 | read |
| `create_gmail_draft` | 在 Gmail 创建草稿 | external |
| `create_eml_draft` | 为 QQ/163 等生成 `.eml` 草稿 | external |
| `attach_resume_to_draft` | 添加已确认的简历附件 | external |

邮件边界：

- 邮件标题和正文由 Pi 生成。
- OAuth 和授权码由 MailAdapter 管理，绝不进入 Prompt。
- 创建草稿前显示收件人、标题、正文摘要和附件。
- Agent 不拥有发送邮件工具。
- V1 不实现 SMTP 自动发送。

### 11.3 桌面能力

| 工具 | 作用 | 风险 |
|---|---|---:|
| `show_notification` | 显示本地通知 | external |
| `schedule_interview_reminder` | 设置本地面试提醒 | write |
| `choose_local_file` | 请求用户选择文件 | external |
| `export_resume_file` | 导出用户确认的简历 | external |

文件选择和导出必须由用户界面发起或确认。

## 12. 工具确认策略

确认机制统一为通用 Action Approval，不由各工具自行解析用户确认文字：

```text
prepare_* Tool
  → 领域校验并创建 Proposal
  → ApprovalManager 冻结 Payload 并发出 approval.required
  → 宿主显示 接受 / 拒绝 / 自定义回答
      ├─ 接受 → ExecutorRegistry → 领域 Executor → 业务 API
      ├─ 拒绝 → Proposal 失效，不执行
      └─ 自定义 → Proposal 失效，反馈作为自然语言交回 Agent
```

通用层只管理 Proposal ID、风险、快照 Hash、一次性消费、状态和事件，不理解具体
业务字段。经历、JD、简历、投递记录、邮件和浏览器操作继续使用各自的 prepare
工具、Schema 与 Executor，禁止建立包含所有业务字段的通用写入工具。

审批安全约束：

- 接受只能执行用户看到的冻结 Payload。
- 一个 Approval ID 只能处理一次。
- 同一业务范围的新 Proposal 自动替换旧 Proposal。
- `reject` 和 `custom` 都不能调用写入 Executor。
- 实际 Executor 不进入模型 Tool List。
- 删除、薪资字段和文件上传以后使用更高风险样式。
- 表单最终提交和邮件发送不提供 Executor，始终由用户手动完成。

### 自动执行

- 固定资产读取。
- 搜索。
- 结构校验。
- 匹配分计算。
- 获取页面字段描述。

### 一次确认

- 创建或修改经历。
- 保存 JD。
- 保存新的简历版本。
- 创建或修改投递记录。
- 上传材料。
- 创建邮件草稿。
- 批量填写普通表单字段。

### 强确认

- 删除任何固定资产。
- 填写薪资、证件等敏感字段。
- 上传简历或其他文件到招聘网站。
- 修改关键投递状态。

### 永远禁止

- 自动提交招聘表单。
- 自动发送邮件。
- 绕过验证码。
- 任意 Shell。
- 任意 SQL。
- 任意文件系统访问。
- 任意 JavaScript 执行。
- 将登录 Token、邮箱 Token 或 API Key 发送给模型。

## 13. 登录和 LLM

Agent 启动前必须存在有效登录状态。

`AuthProvider` 负责：

- 通过邮箱和密码获取当前后端 Session Token。
- 从系统安全凭据库恢复 Session。
- 启动时调用 `/users/me` 验证 Session。
- Session 过期或被撤销后清除本地凭据并重新登录。
- 在 Token 失效时暂停 Agent。
- 登出时通知 Agent 清理当前运行状态。

CLI 不保存邮箱密码。现有后端 Session Token 使用系统凭据库保存：

- macOS Keychain。
- Windows Credential Vault。
- Linux Secret Service。

当前后端 Token 有效期为 7 天，期限内自动恢复登录。用户显式退出时同时撤销
服务端 Session 并清除本地安全凭据；普通关闭 CLI 不执行 logout。

后续浏览器登录采用一次性 Authorization Code + PKCE，只替换 Session 的签发
方式，继续复用 `AuthSessionStore`、Session 验证和 Agent 工具。

LLM 调用由 `LlmProvider` 封装。Agent Core 不在代码中保存 DeepSeek API Key。

桌面 Pi 不调用 LangGraph。即使 LLM 请求经过后端网关，后端也只负责鉴权、配额和模型转发，不启动 LangGraph。

## 14. 事件模型

CLI 和 Electron 使用同一套事件：

```text
agent.started
agent.message.delta
agent.message.completed
agent.tool.started
agent.tool.completed
agent.tool.failed
approval.required
approval.resolved
approval.executing
approval.completed
approval.failed
agent.cancelled
agent.failed
agent.completed
```

事件只包含用户可见进度，不暴露模型隐藏思维过程。

Electron 将事件映射到聊天 UI；CLI 将事件打印到终端。

## 15. Prompt 结构

System Prompt 建议拆成稳定的几个部分：

1. 产品角色和语言。
2. 固定资产与本地数据边界。
3. 工具使用规则。
4. 确认和禁止操作规则。
5. 事实真实性要求。
6. 当前可用工具。

业务任务通过短 Task Prompt 注入：

- `experience_capture`
- `jd_analysis`
- `resume_generation`
- `resume_edit`
- `application_tracking`
- `form_fill`
- `mail_draft`

Task Prompt 是指令模板，不是 Agent 节点。

System Prompt、Task Prompt 和 Tool Schema 都必须带版本号，便于回归测试。

## 16. CLI 验收用例

CLI 第一阶段至少跑通：

1. 登录并获取当前用户。
2. 搜索经历并读取详情。
3. 对话式创建一条经历，预览后保存。
4. 修改经历，拒绝确认时不写入。
5. 导入一个 JD。
6. 基于 JD 和经历生成匹配报告。
7. 生成结构化简历。
8. 用户确认后保存为新的简历版本。
9. 创建投递记录。
10. 退出重新进入后恢复本地 Pi Session。
11. Web 端无法看到 CLI/Pi 聊天。
12. 整个过程中没有 LangGraph 请求。

CLI 第二阶段至少跑通：

1. 使用测试网页读取 JD。
2. 识别标准表单字段。
3. 生成填表计划。
4. 用户确认后逐项填写。
5. 最终提交保持未点击状态。
6. 生成带简历附件信息的邮件草稿。
7. 生成可打开的 `.eml` 文件。

## 17. 测试要求

### 单元测试

- Tool Schema 校验。
- 风险分级和确认策略。
- 固定资产 Repository 调用。
- Token 失效处理。
- Session 加密和用户隔离。
- Prompt 和 Tool 版本。
- 确定性匹配评分。

### 集成测试

- Pi 工具循环。
- 真实后端测试账号。
- 写入后 Web API 可以读取结果。
- 超时、取消和重试。
- 后端返回 401、403、409、429、5xx。
- 大型 Tool Result 压缩。

### Agent 评测

- 该读数据时是否调用读取工具。
- 没有证据时是否拒绝编造。
- 写入前是否请求确认。
- 用户拒绝后是否停止写入。
- 是否会尝试调用未授权能力。
- 是否错误地把聊天内容写成固定资产。
- 简历事实是否能关联到经历证据。

## 18. 实施阶段

### Core-0：基础骨架

- [x] 初始化 TypeScript package。
- [x] 接入 Pi Agent Core。
- [x] 实现单 Agent、System Prompt 和统一事件映射。
- [x] 实现仅自然语言输入的 CLI。
- [x] 实现 Tool Registry 和只读诊断工具。
- [x] 使用 Pi Faux Provider 跑通模型选择工具的离线闭环测试。
- [ ] 在接入登录后实现按用户隔离的本地 Session。

### Core-1：云端固定资产工具

- [x] 接入登录。
- [x] 实现 `get_current_user`。
- [x] 实现经历读取 Repository。
- [x] 实现 `search_experiences` 和 `get_experience`。
- [x] 实现经历导入写入工具。
- [x] 实现首个写入确认策略。
- [ ] 实现 JD、简历、投递记录工具。
- 跑通 CLI 主要用例。

### Core-2：生成质量

- JD 分析 Prompt。
- 匹配评分和证据校验。
- 结构化简历生成。
- 简历版本保存。
- 建立固定回归数据集。

### Core-3：平台工具验证

- [x] CLI SelectedFileRegistry 与 PDF/DOCX/TXT/MD 解析。
- Playwright 测试 BrowserAdapter。
- 测试 MailAdapter。
- `.eml` 草稿。

### Desktop-1：Electron 集成

- [x] Electron + Vue 应用壳。
- [x] 左侧多对话创建、切换、重命名和删除。
- [x] 本地加密保存并按登录用户隔离 Pi 对话。
- [x] Vue Markdown 聊天 UI。
- [x] Pi 流式事件接入。
- [x] 通用审批卡片接入。
- [x] Electron `safeStorage` 登录 Session。
- [x] 简历 Artifact 预览区域骨架。
- WebContentsView BrowserAdapter。
- 正式 MailAdapter。
- 文件选择、导出和通知。

## 19. 当前落地状态（2026-07-23）

当前代码使用 TypeScript，原因是 Pi SDK 和未来 Electron 主进程都运行在 Node.js
环境中，可以共享 Agent、Tool Schema、事件类型和测试，不需要维护
Python 与 Electron 之间的桥接进程。

已落地文件：

```text
src/
├── api/
│   ├── coolto-api-client.ts
│   └── types.ts
├── auth/
│   ├── keychain-session-store.ts
│   ├── session-manager.ts
│   └── session-store.ts
├── agent/
│   ├── coolto-agent.ts
│   ├── create-agent.ts
│   ├── events.ts
│   └── system-prompt.ts
├── actions/
│   ├── create-action-approvals.ts
│   └── experience-import-executor.ts
├── approvals/
│   ├── approval-manager.ts
│   ├── approval-store.ts
│   ├── executor-registry.ts
│   └── types.ts
├── cli/
│   ├── approval-ui.ts
│   ├── args.ts
│   ├── login.ts
│   ├── logout.ts
│   ├── render-event.ts
│   └── main.ts
├── files/
│   ├── parse-selected-file.ts
│   ├── selected-file-registry.ts
│   └── types.ts
├── import/
│   ├── approval-draft.ts
│   ├── duplicate-checker.ts
│   ├── proposal-store.ts
│   ├── types.ts
│   └── validation.ts
├── tools/
│   ├── get-current-user.ts
│   ├── get-experience.ts
│   ├── import-experiences/
│   ├── registry.ts
│   ├── runtime-info.ts
│   ├── selected-files.ts
│   └── search-experiences.ts
├── config.ts
└── index.ts
```

当前模型配置为 DeepSeek Provider，默认模型为 `deepseek-v4-flash`。开发阶段
从本地 `.env` 读取 API Key；正式桌面版会改为登录后访问 Coolto 的鉴权模型网关，
密钥不随客户端分发。

当前根据依赖最多注册七个工具：

- `get_runtime_info`：只读诊断工具。
- `get_current_user`：通过现有后端读取当前登录用户。
- `search_experiences`：分页列出或按关键词、类别、标签筛选经历。
- `get_experience`：按经历 ID 获取当前完整内容。
- `list_selected_files`：只列出宿主明确选择的附件元数据和不透明 ID。
- `parse_selected_file`：在本地解析已选择的 PDF、DOCX、TXT 或 MD。
- `prepare_experience_import`：结构校验、精确去重并生成内存预览。

`ExperienceImportExecutor` 是宿主内部 Action Executor，不向模型注册为工具。

经历数据采用最小读取原则：

- 列表接口只向模型返回元数据，不包含经历正文。
- 只有当前任务需要具体内容时才调用 `get_experience`。
- `get_experience` 返回当前正文，但历史 revisions 只返回 ID、来源、状态和时间，
  不把全部历史正文送入模型。
- 当前配置使用 DeepSeek API，因此 Tool Result 中被读取的数据会进入该次模型
  推理上下文；它不与 Web 聊天同步，也不在桌面端持久化为固定资产缓存。
- 产品已确认信任当前 DeepSeek 数据处理链路，读取工具不做逐次确认；该授权不扩展
  到创建、修改、删除、表单提交或邮件等写入/外部操作。

登录使用后端现有 `POST /v1/auth/login` 和 HttpOnly `access_token` Cookie。
CLI 通过掩码输入接收邮箱和密码，密码不保存。登录后的 Token 由
`@napi-rs/keyring` 写入操作系统安全凭据库。普通退出保留登录状态；执行
`npm run logout` 时调用 `POST /v1/auth/logout` 并清除安全凭据。

当前工具闭环：

```text
自然语言 → Pi Agent → 模型自行选择 Tool → 执行 Tool
→ Tool Result 返回模型 → 模型生成最终回答
```

离线测试已覆盖：

- System Prompt 包含自主选工具、缺失信息追问和禁止编造约束。
- 工具注册表名称唯一且边界明确。
- 缺少开发模型密钥时给出明确启动错误。
- Faux LLM 主动选择工具后，Pi 完成第二轮模型调用并输出最终文本。
- 登录成功后 Cookie 自动传给 `/v1/users/me`。
- 有效 Session 可在再次启动时恢复，无需重新输入密码。
- 失效 Session 会被清除并回退到邮箱密码登录。
- 系统 Keychain 的真实写入、读取和删除闭环已验证。
- 后端认证错误被转换成包含 HTTP 状态和错误码的本地异常。
- 经历查询参数 `q/category/tags/limit/cursor` 与后端协议一致。
- Pi 可先调用 `search_experiences`，再根据返回 ID 调用 `get_experience`。
- 本机后端经历列表和详情接口均返回 HTTP 200，字段结构与本地类型一致。
- 测试账号已完成真实 DeepSeek 端到端验证：首次登录、Keychain 保存、经历搜索、
  经历详情读取、模型总结和第二次启动自动恢复 Session 均成功。
- “基于所有经历生成自我介绍”已真实验证：Agent 获取完整列表后读取全部 7 条经历
  详情并生成综合文本。该能力直接使用单 Agent 推理，不增加生成节点或专用工具。
- 经历导入离线闭环已验证：Pi 从自然语言提取候选并生成 Proposal；接受后由宿主
  Executor 写入，拒绝和自定义回答不会执行写入。
- 已使用真实 DeepSeek、登录 Session 和云端经历列表验证 Markdown 附件链路：
  Agent 依次选择附件、解析、生成正式 Proposal 并完成查重；测试未确认、未写入。
- 已使用现有含文本层 PDF 做本地解析验证，能够提取文本；扫描件 OCR 暂不支持。
- 导入候选字段校验、精确重复判断、重复项默认跳过、Payload 快照、审批一次性消费、
  拒绝、自定义回答、文件访问隔离以及 DOCX 解析均有测试覆盖。
- 已使用真实 CLI 验证待决策卡片和拒绝路径；选择拒绝后没有调用写入 Executor。
- 文件路径不暴露给模型；模型只获得文件名、大小、类型、不透明附件 ID 和解析文本。
- Proposal 和解析内容只存在于当前进程内，退出即失效，不作为固定资产持久化缓存。

当前文本生成边界：

- 可以生成自我介绍、经历总结、能力概述。
- 用户在自然语言输入中提供公司、岗位或 JD 后，可以生成 Cover Letter。
- 尚未接入云端 JD 读取，所以不能自行选择或获取已保存 JD。
- 生成结果当前只返回对话，尚不能保存为 artifact、导出文件或创建邮件草稿。

下一步继续 Core-1：接入云端 JD 的读取和保存。经历导入暂不增加更多节点或
专用 Agent；Electron 只需把文件选择结果注册给同一个 SelectedFileRegistry。

## 20. 下一实施切片

第一批 CLI 工具按以下顺序实现：

```text
get_current_user       [已完成]
search_experiences     [已完成]
get_experience         [已完成]
experience_import      [已完成]
jd_read_and_save       [下一项]
```

前三项和经历导入写入闭环均已完成。`create_experience` 不直接暴露给模型；
`prepare_experience_import` 只创建 Approval，接受后由宿主内部
`ExperienceImportExecutor` 执行。下一切片按“JD → 简历 → 投递记录”的顺序增加
领域工具，并复用同一 Approval 协议。
