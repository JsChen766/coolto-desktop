# Browser Enhance：Agent 托管浏览器路线

> 状态：BE0–BE5 与 BSF0–BSF3 对应基线已完成；Browser Shell Formalization BSF4 当前执行
> 建立日期：2026-08-20
> 前置基线：[浏览器自动填写路线](../browser-autofill-roadmap/README.md) B0–B5、
> [P0 产品能力补齐路线](../p0-product-completion-roadmap/README.md) S3–S4
> 路线关系：本路线是 `browser-autofill-roadmap` 的正式后继；旧路线保留为已实现原语与历史决策，
> 未完成的 B6 集成交付由本路线 BE4、BE5、BE8 吸收，不再单独推进
> 执行约束：2026-08-23 用户确认先完成 Browser Enhance BE1–BE8，再返回 S4.5 → S5 → R1；
> BE0 完成记录：[00-foundation](./00-foundation/README.md)

## 1. 路线目标

把现有“用户打开页面，Agent 经一次授权后帮忙填写”的浏览器，升级为真正由 Agent 驱动的
求职执行环境。用户可以将一个明确的求职目标托管给 Agent，Agent 在授权边界内完成：

1. 自主创建、切换和关闭标签页，导航、搜索、读取、比较岗位；
2. 把合适岗位转为 JD，选择或生成实际投递 Resume，填写多步骤表单并在允许时提交；
3. 对每次投递生成可验证回执，并直接写入现有 Application Tracker；
4. 从招聘网站和求职邮件中识别状态变化，联动 Application、Interview、Note、Reminder；
5. 在 macOS 上将已确认的面试和提醒同步到系统 Calendar；
6. 形成“发现 → 判断 → 投递 → 跟踪 → 面试 → 复盘 → 调整策略”的长期闭环。

本路线的核心不是增加更多零散 `browser_*` 工具，而是建立四个产品级能力：

- **可托管**：任务能在用户离开当前页面后继续，但只能在预先授权范围内运行；
- **可恢复**：跨标签、多页面、登录接管、验证码和 App 重启后有 checkpoint；
- **可追责**：每一步有输入、动作、结果、证据和资产版本快照；
- **可联动**：浏览器结果进入现有 JD / Resume / Application / Interview / Reminder 事实链。

## 2. 当前基线与本路线增量

### 2.1 已有能力

- 独立 Electron 浏览器窗口、`WebContentsView` 多标签、地址栏、前进/后退/刷新；
- `persist:browser` Cookie partition，登录态跨 App 重启保留；
- `extract_page` 读取当前活跃标签页的 URL、标题、meta、正文和原生表单概览；
- `data-fill-id` 打标与 fill/select/check/click/scroll/upload 写原语；
- 用户审批后才打开的写权限闸门，绑定 tab + origin，5 分钟空闲失效；
- 写入后 Overlay 逐字段接受/拒绝，验证码探测，最终提交由用户手动完成；
- Application、status event、Interview、Note、Reminder 的 LocalSyncStore/Outbox、
  乐观锁、冲突恢复和 UI；
- Application 已有 `source=browser|email`、`deliveryMethod`、`targetUrl`、`dedupeKey`、
  `pendingConfirmation`、`jdId`、`resumeId` 和 `resumeContentHashSnapshot`；
- App 内 Tracker 日历视图和 Electron 本地通知调度。

### 2.2 关键缺口

- Agent 只能操作当前活跃标签，不能列出、创建、选择、关闭标签或自主导航；
- 页面感知以顶层 DOM 文本为主，没有 screenshot、accessibility tree、iframe/Shadow DOM 能力；
- 当前授权只是单页写权限，不是可描述、可暂停、可撤销的任务级托管契约；
- 没有持久化 AgentTask、checkpoint、动作预算、失败恢复和事件唤醒能力；
- 没有自动提交能力，也没有可靠的“提交成功”判定和 Submission Receipt；
- 浏览器与 Tracker 没有真实写入桥接，旧 B6 的本地 `DeliveryIntent` 方案已经落后于现有
  Application 云端事实模型；
- 没有邮件增量接入，无法稳定发现确认信、面试邀请、Offer 或拒信；
- App 的日历只是内部视图，没有 EventKit/系统 Calendar 适配器；
- 缺少站点政策、站点能力和自动化合规矩阵，不能承诺“所有招聘网站都可自动投递”。

### 2.3 当前架构判断

当前不是从零开始，也不需要另造一套 Agent runtime。已有结构是一个可复用的“会话型 Harness”：

```text
Vue Renderer / Chat UI
  → DesktopAgentRuntime（会话、持久化、取消、审批入口）
  → AgentContextFactory（模型、工具和依赖注入）
  → CooltoAgent / pi-agent-core（完整 model → tool → model 循环）
  → ToolRegistry（模型唯一能力入口）
  → Browser / Proposal / LocalSyncStore / Outbox / 业务 Adapter
```

可直接复用的基础包括：

- `CooltoAgent`、`pi-agent-core@0.84.2` 已实现的 `Agent`、context compaction、事件订阅、
  steering/follow-up、tool pre/postflight、turn stop、abort/idle、重复保护和取消传播；
- `DesktopAgentRuntime` 的会话上下文、transcript 持久化和运行中快照能力；
- `AgentContextFactory` 与唯一 `ToolRegistry` 注入入口；
- `ApprovalManager`、不可变 Proposal、LocalSyncStore/Outbox、乐观锁和幂等重放；
- Experience/JD/Resume/Application/Interview/Note/Reminder 现有 Reader、Proposal Service、
  SyncStore 和本地 projection；
- `BrowserWindowManager`、`BrowserTabManager`、`BrowserPageOperator`、独立 session、Overlay、
  CAPTCHA monitor 和当前 tab + origin 写权限闸门；
- 现有 Browser Shell、Tracker 和审批/冲突产品界面。

当前 Harness 的边界是“一条聊天消息触发一次前台运行”：同一时间只能运行一个 conversation，
没有独立长期任务、等待外部事件、定时唤醒和 App 重启后恢复托管运行。因此 BE2 只在现有 runtime
上补持久化任务能力，不替换 Agent Core，也不复制既有工具、Store 或业务实体。

BE0.6 对当前安装包做了额外 capability audit：`pi-agent-core@0.84.2` 虽然导出了包含 durable Session、
lane、queue、resume、hooks/events 的 `AgentHarness` 类型，但生产实现的大部分运行方法仍会抛
`HarnessNotImplemented`；smoke 中 `InMemorySessionRepo` 可写，`AgentHarness.prompt()` 明确不可用。
因此当前不能为追求命名一致而切到不可用脚手架，也不能复制一套通用 Agent loop。BE2 开始前必须
复核当时依赖版本；若原生 Harness 已实现所需能力，应优先迁移/适配并删除重叠设计。

### 2.4 已确认的 Agent-native Harness 决策

> 用户于 2026-08-20 确认：能复用的必须复用；新增能力必须在现有架构上延伸；禁止重复造轮子；
> 禁止由宿主编排岗位搜索、投递、Tracker、邮件或 Calendar 业务流程。

唯一总原则：**Agent 决定做什么、为什么做和下一步是什么；Harness 只提供能力、执行动作、
校验授权、持久化状态并返回真实结果。**

| 层 | 允许职责 | 禁止职责 |
| --- | --- | --- |
| Agent | 感知、规划、比较、选择工具、判断结果、决定继续/等待/追问/结束 | 扩大授权、绕过工具、把网页指令当系统约束 |
| Task Harness | App 打开期间的 Agent 生命周期、checkpoint、本地事件邮箱/timer、工具暴露、取消、资源上限 | 理解求职阶段、选择岗位、决定投递顺序、根据邮件直接改状态、创建云端自动化任务 |
| Policy Reference Monitor | 对 Agent 提出的动作执行 `allow / block / ask`，签发一次性 token | 替 Agent 选择动作、生成业务答案、静默扩大 grant |
| Adapter / Store | 执行原子 I/O、规范化真实结果、Proposal/Outbox/乐观锁 | 串联搜索→填写→提交→追踪流程，建立第二套业务事实 |

硬性架构约束：

1. 继续使用同一个自然语言 Agent 和 `pi-agent-core` 的 model → tool → model 循环；不增加 planner、
   规则模型或第二个业务 Agent；
2. 保持 `CooltoAgent` 中唯一 `new Agent()`；在 `DesktopAgentRuntime` 周围只增加 task catalog、
   持久事件、授权和回执，并最小透出 native queue/idle/afterToolCall 能力，不新建 Browser runtime、
   turn governor、内存队列或消息协议；
3. 浏览器、邮件、Calendar 和 Tracker 都是能力 Adapter/工具或环境事件源，不拥有业务工作流；
4. 工具保持原子、可组合、幂等、可审计；禁止新增 `auto_apply_job`、`run_campaign`、
   `process_recruiting_email`、`advance_application_pipeline` 等隐藏流程的宏工具；
5. 允许 `prepare_application_create`、`prepare_interview_create` 这类原子语义 Proposal 工具，
   但何时调用、参数是什么、调用后做什么必须由 Agent 决定；
6. App 打开期间，timer、邮件增量、Calendar 变化和浏览器状态变化只写入本地事件邮箱并唤醒同一个 Agent；
   宿主不得按事件类型注入下一业务阶段或直接写 Tracker；
7. DelegationGrant 是 Harness 独立执行的能力契约，不只是 system prompt；模型可读取授权摘要，
   但不能创建、修改或扩大自己的 grant；
8. 完全托管仍保留不可变 Proposal。grant 可以满足预先授权并产生可审计 ApprovalDecision，
   但不得绕过 Proposal、LocalSyncStore/Outbox、乐观锁或服务端规则；
9. Harness 只维护 `created/running/waiting/completed/failed/canceled` 等运行生命周期，
   不维护 `searching/filling/submitting/tracking` 等宿主业务状态机；
10. 当前审批后的 JD/Browser 专用 continuation、Resume `automaticFollowUp` 和
    `BrowserReviewOrchestrator` 在 BE0 做边界审计。Browser Enhance 不复制这些模式；需要续跑时统一
    返回 `approval.completed` 等环境事件，由 Agent 决定下一步。旧能力是否迁移必须单独验证，
    不借本路线做无关破坏性重构。

每个工具在注册时声明 `sideEffect`、`requiredScopes`、`risk`、`idempotency`、`concurrency` 和
`evidence` 元数据。Harness 只按这些元数据执行通用权限与执行策略，不维护“某业务工具之后必须调用
另一个业务工具”的路由表。

新增且确实缺失的基础设施仅限：

- 通用 `AgentTask` / `AgentRun` / `AgentCheckpoint` 本地持久化；
- 仅在 App 打开期间工作的本地事件邮箱、timer wake-up、崩溃恢复和任务锁；
- `DelegationGrant`、Policy Reference Monitor 和一次性 Action/Submission token；
- 浏览器控制原语、ActionReceipt/SubmissionReceipt；
- Gmail/Outlook 与 EventKit 的最小权限 Adapter；
- 以上能力对应的结构化控制面和真实验收，不新增平行 JD/Resume/Application 数据模型。

## 3. 产品模式与 consent 模型

### 3.1 三种运行模式

| 模式 | 用户体验 | Agent 权限 | 默认提交行为 |
| --- | --- | --- | --- |
| 辅助模式 | 用户控制浏览器，Agent 读页、建议、按次填写 | 当前页按次授权 | 永不自动提交 |
| 单次托管 | 用户托管一个明确任务，如“投递这一个岗位” | 任务、站点和时限内授权 | 关键动作按任务确认 |
| 完全托管 Campaign | 用户定义搜索与投递策略后启动一批任务 | 受 Delegation Grant 限制的持续授权 | 契约允许时可自动提交 |

完全托管不等于永久开关，也不允许 Agent 扩大自己的权限。每次 Campaign 都必须由用户在
结构化界面中创建或接受一份不可变授权快照；用户可以随时暂停、终止或撤销。

### 3.2 Delegation Grant

建议新增本地加密、按账号隔离的 `DelegationGrant`。它是用户对一组未来 Proposal 的预先授权，
不是绕过 Proposal。每次外部提交或 Tracker 写入仍需生成不可变 Proposal；宿主只在 Proposal
完全落入 grant 时自动执行并写入审计日志，越界则转为待确认。

每份 grant 至少冻结：

- `taskGoal`：例如“寻找并投递香港地区的后端工程师岗位”；
- `allowedDomains` / `blockedDomains`：允许和禁止自动化的站点；
- `allowedActions`：导航、搜索、读取、保存 JD、生成简历、填写、上传、提交、读取求职邮件、
  更新 Tracker、写 Calendar 分别授权；
- `jobCriteria`：职位、地点、远程政策、公司类型、年资、技术栈、语言、薪酬底线等；
- `assetPolicy`：允许使用的 Resume、是否允许生成新 Resume、语言和事实门槛；
- `answerPolicy`：哪些申请问题可从已验证 Profile/Answer Vault 自动回答；
- `submissionBudget`：用户投递数量上限可为空、最低匹配门槛固定 80%，并保留同公司频率、
  站点限制、credit、安全资源预算和去重规则；
- `expiresAt`、空闲时限、是否允许无人值守；
- `createdByUserAt`、界面版本、政策版本和不可变内容 hash。

### 3.3 动作风险等级

| 等级 | 例子 | 完全托管下的处理 |
| --- | --- | --- |
| R0 只读 | 搜索、读页、切标签、比较岗位 | grant 范围内自动执行 |
| R1 可逆写 | 填字段、选择选项、保存草稿、创建本地 lead | grant 范围内自动执行并记录 |
| R2 外部承诺 | 提交申请、发送求职邮件、更新 Tracker、创建 Calendar event | 仅在 grant 明确包含该动作时自动执行；`mail.send` 例外，永远由用户点击发送 |
| R3 敏感/高不确定 | 登录、验证码、身份/平等机会声明、法律声明、未知薪酬答案、上传非简历文件 | 始终暂停并交还用户，除非已有字段级明确规则且法律/站点允许 |

### 3.4 用户控制面

托管任务不能只显示为聊天消息。产品至少需要：

- **Delegation Panel**：启动前展示范围、站点、投递预算、Resume 策略和敏感动作；
- **Task Control Center**：运行中显示当前目标、标签页、步骤、预算、阻塞和下一动作；
- **Agent Activity Timeline**：按时间展示“观察 → 判断 → 动作 → 结果”，可展开证据；
- **Take Over / Resume**：用户随时接管浏览器，完成登录、验证码或修改字段后继续；
- **Pause / Stop / Revoke**：暂停任务、结束任务、撤销 grant 三个语义必须分开；
- **Action Receipt**：提交、邮件、Tracker、Calendar 等关键动作均有可审计回执；
- **Privacy Center**：查看/删除浏览数据、授权、邮件连接和本地动作证据。

## 4. 核心闭环

### 4.1 托管岗位搜索

```text
用户定义 Campaign + 授权
  → Agent 打开允许的招聘源/公司 Career 页面
  → 自主创建和切换标签、执行搜索、翻页、处理筛选条件
  → 提取候选岗位为本地 BrowserLead（不立即污染云端 JD 库）
  → 去重、事实完整性检查、与 Profile/Experience 匹配
  → 形成 Shortlist，并解释入选/排除原因
  → 满足自动投递策略的 lead 晋升为正式 JD Proposal
  → 进入 Resume 选择/生成与投递
```

`BrowserLead` 只属于本地任务，是尚未确认的候选事实；进入 Shortlist 或准备投递时再通过现有
JD Proposal/Outbox 晋升为正式 JD，避免每天搜索产生大量低价值云端资产。

### 4.2 完全托管投递

```text
正式 JD + 实际 Resume
  → 校验 Resume 质量门禁与 contentHash
  → Agent 在 transcript/checkpoint 中维护当前投递计划
  → 多页面读取、填写、上传、导航和 checkpoint
  → 未知问题：查 Answer Vault；仍未知则暂停向用户提一个问题
  → 提交前重新读取关键字段，做事实与资产一致性检查
  → grant 允许提交：自动点击；否则请求当前动作确认
  → 读取确认页/申请编号/确认邮件形成 SubmissionReceipt
  → 创建或确认 Application，冻结 jdId/resumeId/title/hash
```

“点击了提交按钮”不等于“投递成功”。成功必须至少满足一种证据：

- 页面出现可信的成功状态和岗位/公司上下文；
- 获得站点 application/reference ID；
- 收到与当前岗位可可靠关联的确认邮件；
- 用户接管后明确确认成功。

证据不足时可创建 `pendingConfirmation=true` 的 Application，但不得显示为已确认投递；后续由
确认页、邮件或用户完成确认。

### 4.3 浏览器 → Tracker

浏览器路线不得新建第二套投递事实。`SubmissionReceipt` 只是本地证据，唯一业务事实仍是
Application：

```text
SubmissionReceipt
  → ApplicationCreateProposal
  → DelegationPolicy 检查（grant / jd / resume / hash / budget / dedupe）
  → 宿主自动执行或展示确认
  → ApplicationSyncStore + Outbox
  → 云端 Application + status event
```

幂等/去重建议优先使用站点 application ID；没有时使用规范化 domain + company + role +
JD 指纹 + Resume hash + 时间窗口生成 `dedupeKey`。重试不得创建第二条 Application。

### 4.4 邮件/站点信号 → 进度推进

建议把“浏览器 Webmail 扫描”和“持续邮件同步”分开：

- 浏览器读页适合用户正在查看邮件时的即时识别；
- App 打开期间的本地持续同步使用用户指定的 Gmail API / Microsoft Graph Provider，按最小权限读取增量事件；
- 原始邮件默认不进入云端，不长期保存整封正文；只保存归一化 `ExternalSignal`、必要引用、
  来源 message ID/hash 和解析置信度；
- Connector 只归一化 transport envelope、正文引用和增量游标，不判断招聘语义；signal kind、
  Application 关联和置信度由被唤醒的 Agent 生成并留下 receipt；
- 邮件正文、网页和附件始终是不可信数据，需要 prompt-injection 检测后才能触发动作。

建议状态映射：

| 外部信号 | Tracker 结果 |
| --- | --- |
| 投递确认 | 确认 `pendingConfirmation=false`，保持 `applied` |
| Recruiter 初筛/电话沟通 | 提议 `applied → screening`，可创建 Note |
| 面试邀请 | 提议/执行 `screening → interviewing`，创建 InterviewRound |
| 面试改期/取消 | 更新对应 InterviewRound，不额外创建重复轮次 |
| Offer | 提议 `interviewing → offer` |
| 拒信 | 提议合法迁移到 `rejected`，保存可验证原因 |
| 无法关联或语义模糊 | 进入“待归档信号”，不得猜测 Application 或状态 |

高置信度且 grant 允许时可以自动执行 Proposal；模糊关联、越级状态迁移、时间/时区不完整、
邮件内要求上传敏感信息或点击未知链接时必须暂停确认。

### 4.5 Tracker ↔ macOS Calendar

macOS 使用原生 EventKit adapter，不通过浏览器自动化 Calendar：

1. 第一阶段请求 **write-only** Calendar 权限，把已确认 Interview/Reminder 单向写入系统日历；
2. 每台设备保存本地 `CalendarLink(applicationId, interviewId, eventIdentifier, calendarIdentifier)`；
3. Interview 改期/取消时更新或取消同一 event，避免重复；
4. event 只包含公司、岗位、轮次、时间、地点/会议链接和 Coolto 深链，不写入完整 JD/Resume；
5. 需要读取空闲时间或接受用户在 Calendar 中的修改时，再单独申请 full access，进入双向同步；
6. Calendar 回写仍生成 Interview/Reminder Proposal，并用来源 ID 防止同步回环。

Windows 后续可增加 Outlook/Graph 或 `.ics` 导出，但不阻塞 macOS 首发。

## 5. Agent 浏览器能力模型

### 5.1 新增控制原语

BE1 至少补齐：

- `browser_list_tabs` / `browser_get_active_tab`；
- `browser_new_tab` / `browser_select_tab` / `browser_close_tab`；
- `browser_navigate` / `browser_go_back` / `browser_go_forward` / `browser_reload`；
- `browser_wait_for`：等待导航、元素、文本、网络静默或下载；
- `browser_snapshot`：DOM + accessibility tree + screenshot 的统一观察；
- `browser_query_elements`：不修改 DOM 的语义元素查询；
- `browser_keypress`、`browser_hover`、`browser_drag`；
- frame/shadow-root 上下文选择；
- 下载接管与受控文件注册；
- `browser_submit`：只接受宿主签发的单次 `SubmissionToken`，普通 click 工具仍拒绝提交。

不允许给模型一个不受限的 CDP/JavaScript 执行工具。所有动作必须是主进程可验证、可记录、
可按 grant 拒绝的语义原语。

2026-08-23 BE1 现状复核与实施顺序：

- 已有 `BrowserWindowManager` / `BrowserTabManager` / `BrowserTab` 承载多标签和导航，BE1 只向唯一
  ToolRegistry 暴露原子能力，不创建第二个 Browser runtime；
- 已有 `extract_page` 只读取当前活跃页，写工具具备 current tab/origin gate 与提交按钮拦截；
- 旧 B3 文档曾把 hover/drag 记为已实施，但当前 `BrowserPageOperator` 和工具注册中没有这两个能力，
  BE1 按真实源码视为缺失，不沿用错误完成结论；
- 实施顺序固定为：① 标签与导航；② wait/query/DOM+AX+screenshot 观察；③ key/hover/drag 与
  frame/shadow 上下文；④ 20 个真实 Electron 只读/可逆场景；
- BE1 不实现 `browser_submit`、DelegationGrant、长期任务、邮件或 Tracker 写入；这些仍由 BE2–BE5
  的安全与业务门禁约束。

**2026-08-23 BE1 完成记录：**

- 在唯一 ToolRegistry 增加 16 个原子 Agent 能力：标签 list/get/new/select/close，navigate/back/forward/
  reload，wait/query/DOM+AX+screenshot snapshot，keypress/hover/drag 和受控 download；未新增 Browser
  runtime、宏工具、任意 JavaScript/CDP 工具或 `browser_submit`；
- 标签和导航直接复用 `BrowserWindowManager` / `BrowserTabManager` / `BrowserTab`；所有可见控制、
  key/hover/drag/download 继续经过现有宿主审批与 current tab/origin gate。Agent 不能在浏览器关闭时
  启动隐藏窗口，HTTP(S) 外协议、URL 内嵌凭证、submit click、Enter/NumpadEnter/Space 均被阻断；
- query/tag/write 支持同源 iframe 与 open shadow root；跨域 iframe 按浏览器安全边界不可读写，必须
  用户接管。Snapshot 使用真实 Chrome AX tree，密码/OTP 值脱敏，截图遮罩敏感输入，检测到 CAPTCHA
  时不把 screenshot 交给模型；
- `browser_download` 使用 Electron DownloadItem 写入用户 Downloads 的唯一安全文件名，但 Agent 只
  得到文件名、来源、字节和状态，永不获得本地绝对路径；后续上传仍由系统选择器让用户亲自选取；
- 修正旧 Pi 兼容漂移：浏览器工具失败现在直接 throw，由 `pi-agent-core@0.84.2` 生成真实
  `toolResult.isError=true`，不再把未授权/提交阻断伪报成功；所有浏览器 tool result 在 BE2 短期证据
  仓库落地前不写入持久 transcript，重启后必须重新观察；
- 新增 `qa:browser-agent`：Electron 43.2.0 / Windows 使用隔离 userData、本机 HTTP fixture 和真实
  WebContentsView，27/27 场景通过，覆盖 DOM/AX/screenshot、iframe/shadow、等待、hover/drag/key、
  两标签、导航历史、下载、危险 URL、无授权控制和 submit/Enter 绕过；
- `npm run check` 全绿：730 个源文件全部 ≤250 行；652 tests 中 650 pass、2 platform skip、0 fail；
  Node/Renderer typecheck、Node build、Electron production build 通过。BE1 完成不代表真实招聘站点已
  验收；站点政策、账号和长任务仍留到 BE3/BE8。

### 5.2 混合感知

复杂网页不能只靠当前 DOM 文本：

- DOM/Accessibility：用于高精度读取 label、role、value、状态和稳定定位；
- Screenshot/Vision：用于 Canvas、自定义控件、布局、弹层和视觉状态；
- Site Capability Adapter：描述某站点是否允许自动化、登录/验证码行为和已验收能力，
  不把业务事实或硬编码答案塞入站点规则；
- Observation hash：每次关键动作前后记录页面状态，检测页面突变和重放漂移。

### 5.3 Persistent Agent Harness

建议新增本地实体：

- `AgentTask`：通用用户目标、授权引用与运行生命周期；浏览器 Campaign 只是任务类型之一；
- `DelegationGrant`：授权快照；
- `AgentRun`：同一任务的一次执行实例；
- `AgentCheckpoint`：可恢复的 transcript/memory、标签/页面和资产引用，不保存密码；
- `ActionReceipt`：每个外部动作的输入摘要、结果、页面证据和错误；
- `SubmissionReceipt`：投递专用回执；
- `ExternalSignal`：邮件/站点状态的环境事件，以及 Agent 对其分类和关联的可审计结果；
- `CalendarLink`：设备本地的 Tracker ↔ EventKit 映射。

这些数据默认本地加密。JD/Resume/Experience/Application/Interview/Note/Reminder 继续使用现有云端
事实和 LocalSyncStore，不复制到 AgentTask。

Harness 生命周期至少包含：

```text
draft → awaiting_consent → queued → running
  → waiting(reason: takeover | answer | confirmation | timer | external_event) | paused
  → completed | partially_completed | failed | canceled | expired
```

Harness 不保存 `searching/filling/submitting/tracking` 等业务阶段。当前任务意图、观察、判断和下一步
属于 Agent transcript/memory；Agent 通过通用 `task_wait`、`task_need_user`、`task_checkpoint`、
`task_complete` 工具显式决定挂起或终止。

运行时需要 step budget、model/tool budget、导航超时、重试策略、循环检测、取消传播、checkpoint、
任务锁和崩溃恢复。第一版同一账号只允许一个有写权限的 run，读取型搜索任务可有限并发。

**2026-08-23 BE2 完成记录：**

- 再次核对 `pi-agent-core@0.84.2`：生产继续复用已实现的单一 `Agent`、before/afterToolCall、
  native terminate、turn stop、abort 和现有 Conversation transcript；公开 `AgentHarness.prompt/resume`
  仍抛 `HarnessNotImplemented`，因此只新增产品级 task catalog/policy/event/receipt，不复制模型循环；
- 落地 UUIDv7、canonical JSON SHA-256、AgentTask/Run/Checkpoint、不可变 DelegationGrant + 独立
  revocation、EnvironmentEvent、ToolCapabilityMetadata、PolicyDecision、ActionToken/Receipt；
  PolicyDecision 补齐 owner/task/run/toolCall 关联，避免只靠 requestHash 无法形成完整审计链；
- 唯一 ToolRegistry 为全部现有/新增工具补 capability metadata；普通 list/get 可并行，DOM/AX/debugger
  observation 串行。Managed task 的 beforeToolCall 只做 allow/block/ask，越界/blocked domain/stale
  observation/R3 均 fail-closed；合法 grant 可自动打开现有页面 gate，但不产生宿主业务下一步；
- `prepare_agent_task` 从自然语言冻结 Delegation Proposal，使用专用 DelegationPanel 确认；接受后自动
  建立并启动本机任务。`task_checkpoint/wait/need_user/complete` 由 Agent 决定生命周期，terminal tool
  与其他工具混批会被 preflight 整批拒绝；App 打开期间本地 timer 只投递通用事件；
- task/grant/event/token/receipt 使用 owner hash + safeStorage 加密单文件、临时文件原子替换；原始
  DOM/AX/screenshot 使用独立加密 Evidence Cache，7 天过期；普通 ActionReceipt/PolicyDecision 90 天
  过期。Renderer 不获得路径、Cookie、token、完整 DOM 或截图 base64；
- App 重启把中断 run 恢复为 paused 并投递 `system.run_interrupted`；未消费 ActionToken 收口为
  `uncertain` receipt，不能盲目重做。事件 checkpoint 后才 ack；账号切换同步收回页面 gate、取消 run、
  写 `account_changed` revocation；grant 撤销实测持久化低于 1 秒；
- UI 按已确认结构实现一级「Agent 任务」、主从列表、概览/动态/回执/授权、暂停/继续/停止/撤销、
  窄屏返回、深浅主题与 200% 缩放；BrowserAgentBar 显示控制权并提供暂停/接管/交还/停止；未新增
  主题、图标库、通用工作流设计器或第二套 Application 状态；
- `npm run check` 全绿：789 个源文件全部 ≤250 行；671 tests 中 669 pass、2 platform skip、0 fail；
  Node/Renderer typecheck、Node build、Electron production build 通过。Electron 43.2.0/Windows 独立
  门禁：Harness safeStorage/重启/跨账号/evidence 10/10，任务 UI/深浅/窄屏/200% 11/11，浏览器与
  BrowserAgentBar 29/29；
- 真实 Career/ATS 搜索、站点策略记录、Job Lead 去重和匹配尚未实现，严格留给 BE3；submit、邮件和
  Calendar 仍分别留给 BE4–BE6，不能据 BE2 宣称完全托管可用。

## 6. 更 AI Native 的场景池

以下不是普通浏览器宏，而是基于 Coolto 已有 Experience、JD、Resume、Tracker 事实形成的差异化能力。

### P0：应并入本路线

1. **Job Scout Campaign**
   App 打开期间周期巡视用户允许的岗位源，只报告新增、变更或截止的高匹配岗位；记住上次运行结果，
   避免重复。App 关闭时不在云端继续执行。

2. **质量优先的自动投递策略**
   不按数量盲投。Agent 按 match、证据充足度、Resume 是否可交付、公司偏好和重复风险排序；
   不达 80% 或事实/质量门槛就不投。产品不设每日投递业务上限，但 credit、站点政策、去重和 Harness
   技术安全预算继续生效。

3. **Application Answer Vault**
   把用户在表单中反复确认的工作授权、薪酬、到岗时间、搬迁、语言等答案保存为有来源、有适用范围、
   有有效期的本地事实。以后自动回答；主观题、法律声明和过期答案继续询问。

4. **Submission Receipt / Application Time Machine**
   记录当时的 JD、Resume hash、字段摘要、附件、确认页和站点编号。用户可回答“我当时到底投了什么”，
   也能在争议或重复投递时复查。

5. **Inbox-to-Tracker Agent**
   只处理求职相关增量邮件，把确认信、面试邀请、改期、Offer 和拒信转为结构化 Proposal，而不是
   给用户一份泛化邮箱摘要。

6. **Calendar-aware Interview Agent**
   面试邀请到达后识别时区、检查冲突、生成 Interview/Reminder 和 Calendar event；面试前自动准备
   JD/Resume/经历证据 briefing，结束后提示复盘。

**2026-08-23 BE3 完成记录：**

- 新增本地 BrowserLead、LeadEvaluation、JobSourceCursor；Lead 只保存公开岗位发现事实，不是 JD、
  Application 或第二套云端资产。Adapter 只执行公开 GET + 规范化，Agent 通过
  `record_job_lead_evaluation` 自主给出分数、理由和 Shortlist 决策；宿主只拒绝 `<80` 入选；
- 首批多源采用 Greenhouse Job Board API 与 Lever Postings API。两者官方资料均说明公开岗位 GET
  可用于构建 career/job site；未调用任何需认证或申请 POST endpoint：
  [Greenhouse Job Board API](https://developer.greenhouse.io/job-board.html)、
  [Lever Postings API](https://github.com/lever/postings-api)；
- DelegationGrant 必须在 `jobCriteria.sources` 逐项冻结 `{provider, sourceKey, company}`，并允许对应
  官方 API domain；Controller 在网络请求前校验，不允许只凭 `jobs.search` scope 枚举任意公司；
- 同一 task/source/externalId 使用 canonical dedupeKey；重复读取保持同一 Lead ID，正文变化标记
  changed，来源消失标记 closed。task_wait/task_complete 在存在未关闭且未评估 Lead 时 fail-closed，
  从产品路径保证所有入选/排除都有 Agent 理由；
- App 打开期间的周期增量继续复用 BE2 timer event + task_wait，由 Agent 决定何时 fetch/evaluate/wait，
  宿主没有新增“抓取→评分→投递”工作流；Agent Tasks 概览展示 Shortlist/分数并可打开真实岗位；
- 真实公网 QA 连续读取两次：Greenhouse 官方 `greenhouse` board 15→15、Lever 官方文档
  `leverdemo` board 383→383；第二次全部 unchanged、重复 Lead ID=0。只读取公开岗位，未写站点；
- `npm run check` 全绿：796 个源文件全部 ≤250 行；675 tests 中 673 pass、2 platform skip、0 fail；
  Node/Renderer typecheck、Node build、Electron production build 通过。更新后的 Agent Tasks UI
  Electron 门禁 12/12 通过；
- 本轮没有使用真实用户 credit 批量评估 398 个公开岗位；这不作为质量准确率证据。真实用户目标下的
  匹配质量、来源偏好和长周期效果仍在 BE8 验收，但未评估 Lead 已无法被静默完成或进入 Shortlist；
- 未实现 JD 冻结、Resume 选择/生成、表单 submit 或 Tracker 写入；这些严格属于 BE4。

### P1：核心闭环稳定后

7. **Follow-up Autopilot**
   根据 Application 阶段、公司时区和用户策略，在合适时间生成跟进邮件；发送动作仍受 grant 或单次确认。

8. **Application Strategy Learner**
   使用用户自己的投递→回复→面试→Offer 数据，比较岗位来源、匹配分、Resume 版本和投递节奏，
   提议调整搜索策略。只做个人校准，不把相关性误当因果。

9. **Dynamic Company/Role Brief**
   投递后继续监控公司 Career 页或用户允许的信息源；面试前把 JD 变化、团队信息、近期业务和用户证据
   整合为可追溯 briefing。

10. **Deadline & Portal Watcher**
    监控申请截止、补充材料请求、候选人 portal 状态和待完成测评；只在有变化时提醒。

11. **Scam / Risk Guard**
    检测付费入职、异常域名、索要密码/验证码/证件、可疑附件或与已知公司不一致的联系信息，暂停任务并
    展示证据，不自行断言诈骗。

12. **Recovery by Demonstration**
    Agent 失败时用户接管完成一次操作；系统只学习可泛化的语义步骤和字段关系，不保存密码、原始 Cookie
    或脆弱的个人 DOM selector，下次先在沙盒/预览中验证再复用。

### P2：延伸方向

- Offer 对比、谈薪准备和选择决策板；
- 招聘网站与邮件中的联系人关系图，关联 recruiter、面试官和历史沟通；
- 从面试复盘自动补 Note、后续 Reminder 和新一轮准备材料；
- 多设备任务 handoff：浏览器任务仍本地，云端仅同步最小 checkpoint 元数据与业务事实；
- 用户可复用的“求职策略模板”，但每次运行仍生成新的 Delegation Grant。

## 7. 阶段索引

| 顺序 | 阶段 | 主要交付 | 完成门槛 |
| --- | --- | --- | --- |
| BE0 | 产品契约与威胁模型 | Harness 不变量、复用矩阵、模式、grant、风险等级、数据归属、站点政策 | 用户确认全部关键取舍；宿主业务编排禁令可静态/动态验证；prompt injection/误提交/隐私/恢复威胁测试可执行 |
| BE1 | Agent Browser Control | 标签、导航、等待、混合快照、frame/shadow、键鼠原语 | 真实 Electron 跨标签完成 20 个只读/可逆任务；无越权导航或上下文串用 |
| BE2 | Persistent Agent Harness | AgentTask、grant、事件邮箱、checkpoint、接管、暂停/恢复、审计 | 不新增第二套 Agent Core；grant 越界 100% 被 Harness 拒绝；撤销立即生效；重启可恢复且不重复动作 |
| BE3 | Managed Job Scout | App 打开期间的多源搜索、BrowserLead、去重、匹配、Shortlist、周期增量 | 真实允许站点连续运行；App 关闭时无云端任务；重复 lead <1%；所有入选/排除理由可追溯 |
| BE4 | Managed Apply + Tracker | 多页填表、Answer Vault、SubmissionToken/Receipt、Application Proposal | 自动提交仅发生在有效 grant；错误投递/重复 Application 为 0；实际 JD/Resume/hash 冻结正确 |
| BE5 | Inbox Signals | 通用 Browser Webmail、可选 Gmail/Outlook 增量、求职邮件分类、状态/Interview Proposal | 原始邮件不越界持久化；错误自动迁移为 0；模糊信号进入确认队列 |
| BSF | [Browser Shell Formalization](./browser-shell-formalization/README.md) | 独立 Browser 产品面、正式浏览器基础、Agent 可见层、新标签页、下载和跨平台验收 | **实测延期、未完成**：NVDA、真实接管、deep-link 经用户明确延后，后续与 macOS 收口回补 |
| BE6 | macOS Calendar | EventKit 权限、单向写入、映射、改期/取消；可选双向 | **当前阶段**；拒绝权限可降级；无重复 event/同步回环；时区和重启恢复通过 |
| BE7 | AI Native Loops | Scout 调度、Follow-up、Briefing、Strategy Learner、风险提醒 | 每项有独立开关、停止条件、通知去重和效果指标 |
| BE8 | 真实集成交付 | 真实账号/站点、长任务、断网、崩溃、跨账号、安全与发布验收 | 完整矩阵通过前不得宣称“完全托管可用” |

Browser Enhance 内部长期顺序：

```text
BE0 → BE1 → BE2 → BE3 → BE4 → BE5 → BSF0–BSF4 → BSF5 Windows → BE6 → BSF5 macOS → BE7 → BE8
```

BE0、BE1、BE2 是任何自动提交的硬前置；不得先开放 submit 再补 consent 或审计。

当前跨路线唯一执行顺序为：

```text
BE0（已完成）→ BE1（已完成）→ BE2（已完成）→ BE3（已完成）→ BE4（已完成）→ BE5（手动确认基线已完成）
→ BSF0（已完成）→ BSF1（已完成）→ BSF2（已完成）→ BSF3（已完成）→ BSF4（已完成并质检闭环）→ BSF5 Windows（实测延期）→ BE6（当前）→ BSF5 Windows/macOS 回补收口 → BE7 → BE8
→ S4.5 → S5 → R1
```

2026-08-23 用户明确覆盖此前“先回 S4.5”的顺序，要求先按本路线完善浏览器。每阶段仍需独立质检，
不得因总路线已排期而跳过 BE1/BE2 或提前开放自动提交。

2026-08-31 用户明确要求 BSF5 的剩余实测先延期并继续下阶段。该决定只移动执行指针，不把 NVDA、真实登录/
OTP/CAPTCHA takeover→resume、完整任务 deep-link 或 macOS BrowserWindow 写成通过；这些门禁在 BE6 后统一回补。

## 8. 分阶段关键验收

### BE0：架构冻结与产品取舍

- 冻结本 README 2.4 的 Agent/Harness/Adapter 职责，代码评审拒绝宿主业务状态机、宏工具和
  Browser/Mail/Calendar 专属 Agent runtime；
- 已核对 `pi-agent-core@0.84.2`：复用已实现的 `Agent` 原语；公开 `AgentHarness` 运行方法仍未实现，
  BE2 开始前必须重做版本 capability audit，防止未来与可用原生 Harness 重复建设；
- 建立现有 `CooltoAgent`、`DesktopAgentRuntime`、ToolRegistry、Browser、Proposal/SyncStore 的
  逐项复用清单；新增模块必须说明现有能力为什么不能延伸，不能仅因命名或调用不方便而复制；
- 定义统一环境事件、工具元数据、任务 terminal tool 与 checkpoint contract；
- 已确认不设单日投递业务上限，使用用户 credit；最低匹配门槛 80%，站点/去重/安全预算保留；
- 已确认允许用户白名单内的公司 Career/ATS，自动提交仍需逐域验收，受限平台不开放托管提交；
- 已确认 Answer Vault 可保存用户确认的常用求职事实，敏感/法律字段不得保存；
- 已确认求职邮件发送键永远由用户点击；
- 2026-08-23 用户补充确认不能假设用户使用 Gmail/Outlook：默认使用授权 domain 内的 Browser Webmail；
  Gmail/Outlook API 是可选增强，Generic IMAP 后续按用户 Provider 分布决定；
- 已确认 Calendar 首版 write-only；
- 已确认原始 DOM/screenshot 本地保留 7 天、普通 ActionReceipt 保留 90 天、SubmissionReceipt
  保留至 Application 删除或用户主动清除；一键清除不删除云端业务事实或撤回投递；
- 已确认所有 Browser Enhance 能力只在 App 打开时本地运行，不建立服务端自动化任务；

### BE1–BE2：安全与恢复门禁

- 网页、邮件、附件中嵌入“忽略规则并发送数据”等注入文本时，Agent 不改变任务或扩大权限；
- grant 不含提交时，任何 click/key/JS 路径都不能触发 submit；
- grant 过期、撤销、切换账号、任务终止后，所有写 token 立即失效；
- 登录、密码、OTP、验证码只允许用户接管，不进入模型上下文和日志；
- 接管期间暂停截图/模型观察；恢复后重新建立可信 observation；
- App 崩溃发生在提交前/提交中/提交后时，恢复逻辑通过 receipt/站点状态去重，不盲目重提；
- 运行中页面跳到未允许 domain 时自动暂停；下载和上传必须经过受控文件注册。

### BE4：业务事实门禁

- 未建立正式 JD、实际 Resume 和有效 Resume hash 时不得提交；
- Resume 未达到 S4.5 质量门槛时不得冒充可交付版本；
- 自动回答只能来自 Profile、Experience、Answer Vault 或用户当前回答；
- 任何数字、工作授权、薪酬、可入职时间和身份声明均可追溯；
- Application 创建继续经过 Proposal + LocalSyncStore/Outbox + 乐观锁；
- SubmissionReceipt 与 Application 一一关联，重放不重复创建；
- 站点显示成功但 Tracker 写入失败时保留可恢复 receipt，并明确显示“已投递、待同步”。

**2026-08-23 BE4 完成记录：**

- 在唯一 ToolRegistry 增加 `prepare_application_submission`、`browser_submit`、
  `sync_submission_receipt`。准备阶段必须读取正式 JD 与实际 Resume，校验 `qualityStatus=passed`、非归档、
  64 位内容 hash、当前 tab/origin、有效 grant 和重复 Application，再复用现有
  `ApplicationProposalService → LocalSyncStore/Outbox` 冻结 JD/Resume/hash；
- 普通 `browser_click_element` 与 Enter/Space 仍不能提交。只有专用 `browser_submit` 能消费短期
  SubmissionIntent/ActionToken 并调用受限 submit 原语；成功与超时分别生成 confirmed/pending
  SubmissionReceipt。相同 intent 重放返回同一 receipt，不重复点击或创建 Application；
- SubmissionIntent 在外部点击前原子写入 `startedAt` claim。若 App 在 claim 后、receipt 前中断，恢复时
  只收口为 pending receipt 并请求核验，不盲目重提；Tracker 暂时写入失败时保留 receipt，后续只允许
  `sync_submission_receipt` 重试业务同步；
- SubmissionReceipt 与 Application 一一关联并在详情页展示状态、投递时间与实际 Resume hash；本地
  回执保留至 Application 删除，删除时连同对应 intent 清理，不影响站点上的既成投递事实；
- Answer Vault 作为 owner 隔离的 Harness 加密本地事实落地，支持工作授权、签证、搬迁、语言、到岗时间、
  薪酬范围及 domain/有效期。Agent 可按站点读取；新增/更新必须经过现有不可变 ApprovalManager，接受前
  零写入。EEO、残障、退伍军人、种族、宗教、性别、身份/法律声明、密码、OTP 等字段 fail-closed；
- 新增 V1 Harness 状态兼容归一化：旧加密文件缺少 BrowserLead/Submission/Answer Vault 扩展集合时补空
  集合，不再将整份旧任务状态静默丢弃；Answer Vault 和 Submission 工具原始结果不持久化到 transcript；
- `npm run check` 全绿：807 个源文件全部 ≤250 行；687 tests 中 685 pass、2 platform skip、0 fail；
  Node/Renderer typecheck、Node build、Electron production build 通过。Electron 43.2.0/Windows 门禁：
  Browser/Managed Apply 31/31、Harness 10/10、任务 + Answer Vault 审批 + Tracker receipt UI 14/14；
- 本阶段证明的是本地真实 Electron fixture 上的机制闭环，没有在真实用户招聘账号发起投递，也不是站点
  可用性证明。生产真实域名的 `browser_submit` 继续默认 fail-closed，仅测试 origin 可通过显式环境配置；
  每个 Career/ATS 的条款、页面、账号、长任务和安全验收统一留在 BE8，完成前不得称“完全托管可用”。

### BE5–BE6：联动门禁

- 邮件信号先关联 Application，再提出状态迁移；不能按公司名模糊匹配就静默写入；
- 后端非法状态迁移必须保留服务端错误，不能由 Agent 绕过；
- 面试邮件的日期、时区、轮次或会议链接不完整时先确认；
- EventKit 权限拒绝或被撤销不影响 Tracker 主流程；
- Calendar event 删除不能自动删除 Interview 事实，只能生成变更 Proposal；
- Tracker/Calendar 任一侧变更都携带 source identifier，防止来回创建。

**2026-08-31 BE6 第一切片（平台中立合同与同步计划）：**用户明确将 BSF5 剩余实测延期并继续 BE6；该移动
不把 BSF5 写成完成。实现前核对 Apple EventKit 最小权限合同后发现原路线同时要求“write-only + 重启后改期/
取消同一 event”不可直接成立：write-only 不能读取任何既有 event，包括本 App 创建的 event。当前按最小权限
拆为可执行合同，原生权限与真实 Calendar 留到 macOS：

- 新增 `CalendarEventDraft`、`CalendarLink`、授权状态和显式 `CalendarSyncPlan`；CalendarLink 绑定精确
  `applicationId + interviewId + eventIdentifier + fingerprint`，跨投递或跨面试映射 fail-closed；
- 已确认且信息完整的 scheduled Interview 映射为公司、岗位、轮次、起止时间、时区、地点或会议链接、调用方提供的
  Coolto 深链；不写完整 JD/Resume。缺少 scheduledAt、duration 或合法 IANA timezone 时不生成事件；
- 首次创建在 `not_determined` 下只计划 `request_write_only`，授权后计划 `create`；相同 fingerprint 返回 unchanged，
  不重复创建；completed 或从未建立 CalendarLink 的 canceled Interview 不产生 Calendar mutation；
- 已有 CalendarLink 的改期/取消在 write-only 下返回 `request_full_access`，只有 full access 才计划 update/cancel；
  denied/restricted/unavailable 均返回明确降级原因并声明 Tracker 事实不受影响。此切片只建立计划合同，尚未请求
  full access、未实现 EventKit native adapter、设备本地 link store 或任何真实 Calendar 写入；
- `test/calendar-sync-plan.test.ts` 8/8 通过；`npm run check` 全绿：959 个源文件均不超过 250 行，893 tests 为
  891 pass、2 个平台 skip、0 fail，Node/Preload/Vue typecheck、Node build、Electron production build 与 5 个
  sandbox preload standalone 门禁全部通过。Apple 权限依据：
  <https://developer.apple.com/documentation/EventKit/accessing-the-event-store>。

**2026-08-23 BE5 实现进展（阶段仍未完成）：**

- 用户确认 Browser Webmail 为默认通用来源，Gmail/Outlook 不再是 BE5 前置。新增
  `capture_browser_mail_event`：只在不可变 grant 同时包含 `browser.read + mail.read`、
  `connectorPolicy.browserWebmail=true` 且当前 Webmail origin 命中 allowedDomains 时执行；
  fresh snapshot 中的 sender、subject、时间证据和必要正文必须与工具参数逐字一致；只保存当前邮件的
  必要正文，不复制整个收件箱。相同 origin/URL/sender/subject/time 生成稳定 source hash 并去重；
- 新增 provider-neutral MailConnection/InboxIncrementalAdapter。Gmail 使用 `messages.list/get` +
  `history.list(startHistoryId)`，404 过期游标回到最近 30 天基线；Outlook 使用 Inbox
  `messages/delta` 并原样保存受 origin/path 校验的 nextLink/deltaLink。两者只做 GET，不存在发送、删除、
  标记已读或附件下载能力；实现依据：
  [Gmail history.list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list)、
  [Gmail messages.get](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get)、
  [Microsoft Graph message delta](https://learn.microsoft.com/en-us/graph/api/message-delta?view=graph-rest-1.0)；
- 设置页增加用户已确认的「Browser Agent / 邮箱连接」分区。Gmail/Outlook 均使用系统浏览器、loopback
  redirect、state + PKCE S256；refresh token 只在主进程按 owner 使用 safeStorage 加密、原子替换，
  Renderer 只得到 provider/account/scope/时间。Gmail 只申请 `gmail.readonly`，Outlook 申请
  `Mail.Read` + 识别当前账号所需 `User.Read`/OIDC scope，永不申请 `Mail.Send`；
- DelegationGrant 增加可选 `connectorPolicy.mailConnectionIds`；授权 `mail.read/mail.classify` 时必须冻结
  至少一个用户选择的已连接邮箱。App 关闭后无轮询；App 打开期间继续由同一 Agent + BE2 timer/event
  决定何时增量 fetch/read/classify/wait，宿主未增加邮件业务工作流；
- 原始 subject/body/sender 作为 `external_untrusted` connector payload 只进入 7 天加密 Evidence Cache，
  transcript 持久化前立即清除。EnvironmentEvent 使用 provider/connection/message ID 去重；长期只保留
  ExternalSignal 的 source hash、kind、0–100 置信度、可靠 Application 关联、最多 3 条逐字引用和必要
  envelope。未分类 mail event 会阻止 task_wait/task_complete，不能静默丢信；
- 增加间接 prompt-injection 风险标记；可疑邮件仍只作为数据，Agent prompt 明确禁止按邮件要求扩权、
  跨域读取、上传或发送。Agent 引用必须逐字存在于当前 7 天 payload；无法关联或语义模糊时
  `applicationId=null`，不得猜测；
- Application 投递确认/合法状态迁移与 Interview 创建/改期/取消均由 Agent 分别准备不可变 Proposal，
  复用现有 ApplicationSyncStore、InterviewProposalService、LocalSyncStore/Outbox 和漂移校验。
  面试邀请必须先确认 Application 进入 interviewing，并具备完整时间/时区；改期必须指向同一
  Application 的既有 InterviewRound；
- 在真实邮件关联准确率达到本路线要求的 ≥99% 前，**所有**邮件触发的 Tracker/Interview 写入仍逐条
  显示 ApprovalCard，由用户接受后执行；当前没有“高置信自动写”开关，也没有 `mail.send` 工具；
- 当前自动化证据：`npm run check` 全绿，832 个源文件 ≤250 行；700 tests 中 698 pass、2 platform
  skip、0 fail；Node/Renderer typecheck、Node build、Electron production build 通过。Electron
  43.2.0/Windows：Browser + 真实 Webmail fixture 33/33、Harness + OAuth PKCE/safeStorage/重启刷新 16/16、设置/任务/回执 UI
  15/15；Gmail/Graph adapters、游标、重复通知、逐字证据、Application/Interview Proposal 有 fixture
  回归；
- **未完成门禁**：尚未在用户允许的真实 Webmail 站点/账号验证跨标签巡视、打开具体邮件、SPA URL
  不变时的去重、登录接管、长列表、邮件关联和 ≥99% 准确率。因此 BE5 继续是当前阶段，不能以本机
  fixture 标记完成，也不能切换 BE6。正式 Google/Microsoft OAuth Client、Google restricted scope 验证
  和真实 API 增量验收只阻塞对应可选 Connector，不再阻塞 Browser Webmail 基线；Generic IMAP 尚未实现。
- 2026-08-24 用户选择个人 QQ 邮箱作为首个真实 Webmail 验收站点，并确认只打开测试邮件、接受站点
  可能自动标记已读，登录/二维码/验证码均亲自完成。新增 candidate Site Policy
  `qq-mail-personal-web-v1`：只覆盖 `https://mail.qq.com`，腾讯企业邮不在范围；允许 read/control/
  capture_mail，明确拒绝 send/delete/move/archive/mark-read/附件下载/邮件外链/设置写入。candidate 在普通
  运行中仍 fail-closed，只有 `COOLTO_BROWSER_SITE_ACCEPTANCE_ORIGINS=https://mail.qq.com` 的监督验收
  进程可 capture；`browser_submit` 的独立测试 allowlist 不受影响。针对性 typecheck 与 8 项 QQ policy/
  Browser Webmail/Delegation 回归通过；真实登录后的页面与阶段完成结论仍待验收。
- 2026-08-29 用户调整正式验收 Provider：个人 Outlook `https://outlook.live.com` 与 163 个人邮箱
  `https://mail.163.com` 组成 Browser Webmail 双站点门禁；个人 QQ 降为补充候选，Microsoft 365、126、
  yeah.net 和各企业邮不自动扩入。Gmail 继续走系统浏览器 OAuth + API Connector，并按用户确认不阻塞
  BE5/BE6；该取舍提升 Provider 多样性，但不等于 Gmail 已完成生产交付。
- 同日补齐 `outlook-personal-web-v1`、`netease-163-personal-web-v1` candidate Site Policy 和托管只读门：
  Browser Webmail 自动巡视必须显式授权 `browser.read/control/write + mail.read/classify`，宿主再把工具面
  收窄为标签/导航/观察、元素标记、安全邮件行点击、滚动和 hover；fill/select/check/upload/keypress/
  drag/download/review/submit 均在已知邮箱 origin fail-closed。点击前读取 role/text/title/href/download，
  只放行同源链接、邮件 row/option/listitem/treeitem/tab 与明确刷新/分页等按钮；发送/回复/转发、删除、
  移动/归档、主动已读、垃圾邮件、设置、附件和外链均由宿主拒绝，未知控件交还用户。元素标记补充 ARIA
  邮件行；Browser Webmail 去重改用逐字时间证据和必要正文，避免 SPA 复用 URL 且信封字段相同时合并两封
  不同邮件。新增半自动真实验收入口：只轮询 URL 等待用户登录，进入邮箱后才定位指定测试主题、打开、
  逐字 capture 两次并验证去重，报告不保存正文。
- 当前自动化证据：相关 19/19 回归；最新完整 `npm run check` 全绿，855 个源文件 ≤250 行、737 tests
  （735 pass、2 platform skip、0 fail）、主进程与 Preload/Vue typecheck、Node/Electron production build
  均通过。`qa:browser-agent` 在当前 Air 显示
  环境完成前 4 项后因 `Current display surface not available for capture` 停在 screenshot 门禁；未关闭或
  降级该断言。真实 Outlook/163 登录后页面、跨标签、长列表、Provider 分层准确率和 ≥99% 总门禁仍未执行，
  因此两个 policy 保持 candidate，BE5 状态不变。
- 2026-08-29 个人 Outlook 登录摸底通过：Windows/Electron 43.2.0 的隔离 QA 浏览器可打开真实
  Outlook 登录页，账号、密码和验证码完全由用户操作，登录阶段脚本只轮询顶层 URL、不读取 DOM 或截图；
  用户确认已成功进入个人 Outlook 收件箱。首次 QA 入口因只依赖 `ready-to-show` 导致进程存在但窗口不可见，
  修为 QA 专用显式 `show/focus`；随后 Outlook 登录跳转切换活跃 tab 被通用 `network_idle` 误判为上下文漂移，
  登录探测移除该非必要读取等待。后续 runner 改用按 Provider 隔离且可复用的临时 QA Profile，避免每次 probe/
  capture 重新登录；该 Profile 只用于验收，完成后必须精确清理。此次只证明可真实登录，尚未读取测试邮件、
  capture、关联 Application 或晋升 Site Policy。
- 同日 Outlook 测试邮件 probe 尚未通过：用户确认测试邮件已到达，并在一次真实窗口中选择“邮件可见未打开”；
  宿主始终只按固定测试主题定位，所有失败运行均为 0 点击。初始 DOM 查询无法看到 Outlook 虚拟列表，随后
  依次补充 accessible label、完整 AX tree、StaticText→交互祖先映射、主题相关节点优先限额、同 origin
  `WebFrameMain.framesInSubtree` 语义执行和同 origin OOPIF target session；跨 origin frame/target 始终拒绝。
  60 秒安全诊断最终仍为 `tokenMatch=0/5; roles=none`，说明固定主题没有进入当前受信 DOM/AX 读取面；在用户
  重新确认列表中完整可见 `Coolto/BE5/Outlook/QA/20260829` 五个 token 前，不继续放宽匹配、不坐标点击、
  不读取其它邮件。Outlook policy 因此继续保持 candidate，打开具体邮件、正文 capture 与去重均未通过。
- 同日按用户要求把正式验收改回正常产品链，而非专用 Webmail runner：用户在普通聊天发送自然语言读取命令，
  Agent 生成只读 Outlook DelegationPanel；接受后主进程依据冻结 grant 自动打开/聚焦现有可见 BrowserShell，
  再启动同一 AgentTask。补齐待审批摘要主动回读，避免瞬时 `approval.required` 事件错过后卡片消失；DelegationPanel
  与普通 ApprovalCard 共用稳定审批 action/accept 验收契约。前台用户启动/恢复的 run 不再误判为 unattended，
  timer/environment wake 仍要求 `unattended=true`；running AgentTask 移除 `prepare_agent_task` 与
  `request_write_access` 二次扩权工具，所有 Proposal 自动包含只负责检查点/等待/结束的 `task.lifecycle`。
  个人 Outlook 根 URL 确定性规范为 `https://outlook.live.com/mail/0/`，其它路径/查询和域名不改写。
- 真实 Windows/Electron 正常 App 验收已证明：自然语言 → 可见授权 → 自动打开“Coolto 浏览器” → Agent 自主导航
  Outlook 产品入口成立；未登录的产品 Browser 会被 Microsoft 导向登录/营销入口，未授权域名由 Harness
  fail-closed，最终任务以 `waiting` 停在用户接管边界，未读取任何邮件、未点击未知控件、未产生邮箱写入。
  这不等于邮件读取通过；下一步必须由用户在该可见 Browser 中接管登录并交还 Agent，再验证固定测试主题、
  两次 capture 去重和 163 同链路。主窗口证据 `local-builds/functional-qa/be5-visible-agent-product-path.png`
  为 131,304 bytes，SHA-256 `8409B9B68DC7DDDE1A4A3917AC739282C9C11F1FA58AED25FF5E89D1E0F3A63F`；
  最新完整 `npm run check` 全绿：856 个源文件 ≤250 行、744 tests（742 pass、2 platform skip、0 fail）、
  Node/Preload/Vue typecheck 与 Node/Electron production build 均通过。BE5 状态仍不变。
- 后续同一正常产品 Browser 由用户完成个人 Outlook 登录，真实页面落到
  `https://outlook.office.com/mail/`，而不是先前假定的 `outlook.live.com`。Agent 在旧运行进程中把该页
  当成未登记域名，无法获得宿主只读裁剪；一次继续尝试还错误替换了已登录标签，已立即恢复原收件箱 URL，
  未读取或修改邮件。代码现已把**精确公共前端** `outlook.office.com` 加入同一个
  `outlook-personal-web-v1` candidate policy，继续拒绝其它 Microsoft 365/企业域，并为该 origin 覆盖
  只读工具面、点击拒绝和 capture acceptance 回归。最新 `npm run check` 再次全绿，数量仍为 856 个源文件、
  744 tests（742 pass、2 platform skip、0 fail）。按用户“不要退已经打开的这个”要求，本轮没有重启当前
  已登录 App；因此新 policy 尚未进入当前进程，必须等用户明确允许一次重启后再复用持久 Browser session
  做真实指定邮件读取，BE5 状态不变。
- 用户随后明确允许只重启 Coolto、不清 Browser profile；登录会话跨重启保留。真实收件箱最终落到新的
  `https://outlook.cloud.microsoft/mail/`，因此宿主把个人 Outlook 冻结为精确公共跳转集合：
  `outlook.live.com`、`outlook.office.com`、`outlook.cloud.microsoft`、`login.live.com`、
  `login.microsoftonline.com`；Proposal 只要命中其中一个就把完整集合写进用户可见不可变授权，Site Policy
  只对三个邮件前端应用相同只读工具/点击/capture 门，不扩展其它企业域。
- 最终正常 App 自然语言运行中，Agent 自动打开可见 Browser、进入已登录
  `outlook.cloud.microsoft/mail/`、搜索固定主题并唯一定位 AX `role=option` 邮件行。由于页面重渲染后的
  fill 标记落在该 option 的无语义子节点，`browser_click_element` 按 fail-closed 拒绝；本轮由宿主只对
  同时包含 `Coolto/BE5/Outlook/QA/20260829` 五个 token 的唯一 AX option 做一次非坐标语义接管，随后恢复
  同一等待任务。AgentTask 进入 `completed`，无工具的自然语言结果回报：主题
  `[Ext] Coolto BE5 Outlook QA 20260829`，发件人 `andrew chen <chenandrew418@gmail.com>`，时间
  `2026-08-29 12:30`，正文只有测试标识 `COOLTO-BE5-OUTLOOK-20260829-A`；未回复、删除、移动、归档或
  下载附件。当前 AX/页面也独立核对到相同主题、发件人/时间和正文标识。
- 已补最小后续修复：fill 目标本身若是 button/link/input/select/textarea 或已有交互 role，绝不上提；只有
  无语义子节点才可提升到最近的 `option/row/listitem/treeitem/tab`，随后读提示与 click 使用同一个安全祖先，
  避免把删除/回复按钮伪装成邮件行。最新完整 `npm run check` 全绿：856 个源文件 ≤250 行、746 tests
  （744 pass、2 platform skip、0 fail）、Node/Preload/Vue typecheck 与 Node/Electron production build
  均通过。该自动点击修复尚未用第二封真实邮件做无接管复验；两次 capture 去重、163、跨标签、长列表和
  ≥99% 关联准确率仍未执行，因此 Outlook policy 与 BE5 状态均不晋升。
- 用户随后发送同主题第二封邮件，正文标识为 `COOLTO-BE5-OUTLOOK-20260829-B`，第一封为 `-A`。真实
  Outlook 行的 aria-label 会包含正文安全提示 “verify the sender / do not reply / open attachments”；旧提交
  检测以 `send` 子串误伤 `sender`，旧 Webmail 动作检测又在识别 `role=option` 前扫描正文中的
  `reply/attachments`，因此合法邮件行仍被拒绝。现改为英文提交词完整单词边界；只读 Webmail 先拒绝下载和
  跨域 href，再放行已确认的 `option/row/listitem/treeitem/tab`，只有其它动作控件才扫描危险文案。回归证明
  正文安全提示不再误伤邮件行，而 reply/download 按钮仍拒绝。
- 最终监督验收使用精确 `COOLTO_BROWSER_SITE_ACCEPTANCE_ORIGINS` 启动正常 App。第一轮 Agent 无接管自动
  打开 A/B，分别成功 capture、read 和 record；同一任务的信号列表为两条，A/B 各一条，发件人与接收时间
  不同，正文标识保留，`applicationId=null`，没有因相同 subject/SPA URL 合并。最初第二次完全相同 capture
  被通用重复调用保护提前拦截，因此宿主只对幂等 `capture_browser_mail_event` 允许一次精确重放，第三次仍拦，
  其它工具规则不变。B 专项真实任务随后连续两次使用完全相同的 sender/subject/time/body 参数，两个调用均
  执行成功并返回同一稳定 event/source hash；该任务的信号列表仍只有一条 B（信号列表按当前任务隔离，因此
  不包含上一个任务中的 A）。这与上一个 A/B 同任务的“两条不合并”证据共同覆盖真实碰撞去重门禁。
- 全程未回复、删除、移动、归档、下载附件、打开外链或猜测 Application 关联。模型在逐字 evidence 参数与
  signal quote 上有先失败后修正的调用，最终任务完成但 smoke 因保留历史 tool error 仍返回非零，不能把它
  描述为零错误运行。最新完整门禁为 856 个源文件 ≤250 行、747 tests（745 pass、2 platform skip、0 fail）、
  Node/Preload/Vue typecheck 与 Node/Electron production build 全绿；此前一次全量运行的无关 update 下载时序
  测试失败，聚焦 19/19 通过后只重跑一次全量并通过。Outlook 自动点击、A/B 不合并及 B 幂等 capture 已有
  真实证据；163、跨标签、长列表与 ≥99% 关联准确率仍未执行，BE5 状态不晋升。
- 2026-08-30 完成 163 个人邮箱真实链路。登录入口 `mail.163.com` 实际落到
  `hw.mail.163.com/js6/main.jsp`，宿主将两者作为精确 163 集合写入同一 candidate policy 与用户可见授权，
  不扩展 126/yeah.net；跨日后旧 Grant 正确过期，新任务明确使用当日有效期。真实页面是网易邮箱 6.0 hash
  模块：全文搜索 `mbox.SearchModule` 返回两封同主题邮件，A/B 正文标识分别为
  `COOLTO-BE5-163-20260829-A` / `-B`，页面时间为 2026-08-30 00:02 / 00:05，发件人均为
  `Jiansheng Chen<jianshengchen528@gmail.com>`。
- 163 邮件行不是标准 row/option，而是 `div[role=link].rF0.nui-txt-flag0`。只读策略仅在精确
  `hw.mail.163.com`、且危险文案检查通过后允许该 class 组合；删除/回复等 link 仍拒绝。真实 Agent 自动点击
  A/B 均成功。阅读正文位于同 origin `readhtml3.jsp` iframe；旧快照由顶层页面先占满 20k 后才追加 frame，
  正文被饿死。现改为多同源 frame 公平分配总文本预算，单 frame 行为不变，真实 capture 随后可逐字看到
  sender/subject/time/body。
- 首轮 163 模型在历史 eventId、无效 ISO 时间和 evidence quote 上发生失败，且曾需一次安全后退接管；最终
  同一 AgentTask 恢复后完成：当前任务信号 2 条，A/B 各一条、不同 event/sourceMessageId/receivedAt，未因
  同主题合并；每封两次完全相同 capture 均执行并返回同一稳定 event，重复未增项，两个 signal 均
  `applicationId=null`。全程未回复、删除、移动、归档、下载附件、打开外链或读取其它邮件。该证据不是
  “单轮零错误”，但双站点真实自动点击、正文读取、A/B 碰撞与 capture 幂等均已通过。
- 最新静止工作树完整 `npm run check` 全绿：856 个源文件 ≤250 行、750 tests（748 pass、2 platform skip、
  0 fail）、Node/Preload/Vue typecheck 与 Node/Electron production build 均通过。Outlook + 163 双站点门禁
  已完成。
- 2026-08-30 同一可见 Browser 内保留 Outlook 与 163 已登录标签，单一 AgentTask 执行 Outlook → 163 三轮、
  共六次切换。每次切换后重新读取 active tab 与 snapshot，Outlook 始终落在
  `outlook.cloud.microsoft`，163 始终落在 `hw.mail.163.com`，标题、URL 与目标 Provider 一致；没有复用
  上一个标签的观察、没有打开或修改邮件。首轮 Outlook snapshot 出现一次 `UnknownVizError`，原样重试被
  repetition guard 拦截；Agent 改用 `includeScreenshot=false` 后恢复并完成任务。因此跨标签门禁按“带可恢复
  错误通过”记录，不写成单轮零错误。
- 163 真实收件箱不是虚拟滚动，而是 `mbox.ListModule` 的六页分页长列表。验收覆盖第 2–6 页五个不同页面：
  第 2–5 页各 20 行，第 6 页 9 行；每页均在内容变化后重新 snapshot/query/tag。163 分页内容先变化、
  `2/6` 等可访问性页码稍后刷新，真实延迟可达数十秒；父 `li` / 内层 `div` 同文 treeitem、分页容器 /
  `div[role=button]` / 内层 `span` 同文按钮也要求选择真实内层交互节点。有界页码轮询曾被 repetition guard
  误判，拆为单步任务后完成。到第 6 页后只点击一次内层收件箱 treeitem 返回第 1 页，再按测试 marker
  重定位并只打开 B；独立只读复核为 `read.ReadModule`，主题完全匹配，正文包含
  `COOLTO-BE5-163-20260829-B` 且读信正文不含 A marker，没有打开其它邮件正文。至此真实长列表门禁通过，
  但异步页码与轮询误判仍是后续需要修正的产品质量问题。
- ≥99% Application 关联准确率不能执行：当前登录账号经 Renderer 只读 Application API 聚合统计为 0 条
  非删除 Application、0 条 company+role 强标签；同时当前 Agent 工具注册表只有 Application 写入/Proposal
  能力，没有列出或读取 Application/Tracker 候选的工具，实际 Inbox Agent 也明确报告无法枚举候选。没有
  ≥100 条真实邮件—Application 标注对，且运行时无法读取候选时，不能用四封测试邮件或 synthetic fixture
  冒充 ≥99% 真实准确率。所有邮件触发写入继续逐条 Approval，BE5 状态不晋升。
- 2026-08-30 补齐上述运行时能力，但不增加第二套匹配器：新增只读
  `search_application_candidates(eventId, query?, cursor?, limit?)`，只读现有账号隔离
  `ApplicationSyncStore` 本地 projection，单页最多 20 条，只投影公司、岗位、JD 标题快照、状态、投递时间、
  待确认、来源与同步状态；墓碑及 `conflict`/`failed` 不成为候选。工具使用独立 R0
  `tracker.application.read` scope，邮箱分类 Proposal 未包含该 scope 时直接拒绝，Approval 以既有样式显示
  “读取投递候选”，不新增页面或自动写开关。
- 候选只向 Agent 暴露当前邮件事件绑定的 `app_N` 短引用。`record_inbox_signal` 的模型参数改为
  `applicationRef`；任意 UUID、其它邮件事件返回的引用、未读取候选和候选 `entityVersion` 漂移均拒绝并要求
  重读。模型可见 signal 也不返回 canonical Application ID；无法唯一判断仍写 `null`。宿主只验证引用来源
  和投影新鲜度，不计算相似度、不选择候选，语义判断继续由同一个 Pi Agent 完成。为遵守行数/职责门禁，
  BE5 工具注册拆到独立 47 行模块，主 registry 从 250 行降至 232 行；system prompt 升为 v124。
- 新增 `eval:inbox-association -- --input <local.jsonl> [--output <report>]`：逐条使用生产
  `createCooltoAgent`、生产 system prompt、生产 Inbox 工具和 Application 过滤。原始邮件/候选只从显式本地
  JSONL 读取，不复制进仓库；报告只保存匿名 case ID、Provider、是否正确、置信度、工具序列、耗时和错误，
  不输出邮件正文或公司/岗位。正式 gate 冻结为 confidence ≥95、至少 100 条、Outlook/163 各 ≥40、
  gold null/歧义样本 ≥20，同时报告 exact accuracy、高置信关联 precision、linkable coverage 与 abstention
  accuracy；全留空无法通过。`--allow-small` 只允许受控 smoke 返回成功，正式 `passed` 仍为 false。
- 自动化与实模证据：专项 26/26；完整 `npm run check` 为 860 个源文件 ≤250 行、758 tests（756 pass、
  2 platform skip、0 fail），Node/Preload/Vue typecheck 与 Node/Electron production build 全通过。两个不含
  真实隐私的 Outlook/163 受控样本使用 `deepseek-v4-flash` + v124，均真实执行
  `read_inbox_event → search_application_candidates → record_inbox_signal`：唯一正向候选关联与
  `screening` 分类正确、置信度 95；同公司/同岗位/同投递时间双候选正确弃权为 `null`、置信度 90。
  聚合 exact accuracy、linkable coverage、abstention accuracy 均为 1，但样本仅 2 条，报告
  `controlledSmokePassed=true`、`gateEligible=false`、正式 `passed=false`。
  用户随后明确批准重启。新构建沿用同一 userData 与 `persist:browser`：原标签未恢复，但重新打开 163 后
  直接进入已登录欢迎页，登录态保留；`get_runtime_info` 已显示 `search_application_candidates`。
- 新建真实受监督 Browser Webmail AgentTask 后，只打开测试邮件 B。首次任务在 `task_need_user` 后，普通聊天
  “继续”没有调用正式 `agentTasks.resume`，因此浏览器虽继续导航，capture 正确拒绝
  `Inbox Signals 需要 running AgentTask`；随后通过产品正式 resume IPC 恢复同一 waiting task并完成。
  B 的 capture/read 成功，真实账号 `search_application_candidates(query=Coolto)` 返回 0 条、无 cursor、
  excluded 0；伪造 `applicationRef=app_999` 被“Application 引用必须来自当前邮件的候选读取”拒绝，拒绝后
  signal 仍为 0。再以 `applicationRef=null`、当前页面逐字 marker 记录成功，最终 list 只有 1 条 null signal，
  `task_complete` 成功。全程未创建/修改 Application，未打开其它邮件，也未发送、删除、移动或下载。
- 该真实 Electron 路径不是单轮零错误：初始普通 run 有一次重复 list、一次已移除的
  `request_write_access` 调用和一次被 Site Policy 拒绝的搜索框 fill；正式 resume 内首次 capture 又因 sender
  展示格式与非 ISO 时间各失败一次，改为页面逐字 sender 和等价 ISO 时间后成功。空候选与伪引用安全门禁
  已通过，但 ≥100 条真实盲测仍无数据，正式准确率 gate 未执行；在下述产品门禁迁移决策前，BE5 不晋升。
- **2026-08-30 产品门禁迁移决策：**用户确认当前没有 ≥100 条真实招聘邮件，不继续制造合成邮件凑数。
  BE5 按“逐条人工确认”基线完成，准确率明确记录为“样本不足、未评估”，不写成 ≥99% 通过；所有邮件关联、
  Tracker 状态和 Interview Proposal 继续逐条 Approval，现有自动写开关仍不存在。≥99% 真实邮件—Application
  关联准确率不删除、不降低，迁移为 BE8 生产验收及未来任何自动写启用前的硬门禁；样本自然积累到足够规模
  后再运行现有 evaluator，未通过则始终保持手动模式。该取舍解除 BE6 的阶段阻塞，不构成自动关联质量证明。
- 2026-08-26 用户优先插入 Managed Apply 的 Resume Reuse Memory：新 JD 生成前，单一 Agent 先调用
  `find_resume_reuse_candidates`，宿主只按同目标岗位、JD keyword 重叠和更新时间缩小已发布且
  `qualityStatus=passed`、非 archived、带来源 JD 的候选，不设“相似度超过 N%”的宿主决策阈值，
  不新增 embedding、向量库、规则模型、第二个 Agent 或生成 loop；Agent 读取完整 source JD/Resume 后
  自主决定是否把 `resumeId` 作为 `create_resume_workspace.baseResumeId`，没有合适候选就从零生成；
- 历史 Resume 只播种新的本地 candidate，不建立 cloud link、不覆盖原 Resume。宿主逐 bullet 重新核验
  当前 Experience 的 revision/contentHash/source offset/quote，丢弃已漂移或无 grounded evidence 的内容；
  全部失效时拒绝该基底。有效 evidence 使用既有 candidate map 重新计算新 JD requirement coverage，随后
  继续执行全库 Experience 检索、must-have、数字/事实、Chromium 单页、尾行、质量审查和保存审批门禁；
- 自动化证据：新增候选缩圈、Agent-only 选择、当前 evidence 播种、新 JD coverage 重算、base 不可变、
  漂移证据拒绝与重复调用幂等回归；`npm run check` 全绿，836 个源文件 ≤250 行，706 tests 中
  704 pass、2 platform skip、0 fail，Node/Renderer typecheck、Node build 和 Electron production build
  通过。尚未用真实模型/JD 对照测量首轮耗时、token 节省率和最终质量等价性，因此这项效率能力不作为
  BE5 完成或实际性能提升的证明。
- 2026-08-26 真实登录账号、Electron 43.2.0/Windows 只读决策链验收：Agent 在 10.749 秒内依次完成
  `search_jds → get_jd → find_resume_reuse_candidates`，目标 JD 没有合格候选时明确选择“从零生成”；
  工具均成功、未调用 `create_resume_workspace`、未创建本地草稿。随后用 `list_resumes` 检查正向样本，
  真实账号云端 Resume 列表为空，因此“找到候选 → 读取 source JD/Resume → 选择基底”的真实正向分支
  暂无数据可验；自动化回归已覆盖该分支，但不能替代真实账号证据。此次按用户确认不运行完整简历生成，
  因而 token/耗时节省和最终质量等价性仍未验收。
- 2026-08-26 用户授权通过真实接口导入临时正向样本后补验：临时 Resume 关联既有来源 JD，包含 13 条
  绑定当前 Experience revision/hash/offset/quote 的 grounded bullet；另建一份不同 ID、同岗位与同要求的
  相似新 JD。用户正文仅为常规提示“请根据这个 JD 生成一份中文简历”，JD 通过产品既有隐藏
  `jdReference` 传入，提示中没有复用、候选、工具名或 `baseResumeId`。Agent 在 27.675 秒内依次执行
  `get_jd → find_resume_reuse_candidates → search_experiences → get_jd/get_resume → 全库 Experience 检索
  → create_resume_workspace`；创建参数中的 `baseResumeId` 与临时 Resume 完全一致，目标 ID 与新 JD
  完全一致，工具成功。工作区已生成一页、占用率 0.71，之后仍因真实 must-have 事实不足进入
  `needs_user_decision`，证明复用没有绕过现有事实门禁。验收按用户要求在工作区建立后由外部测试器取消，
  未继续生成全文；临时 Resume 和新 JD 已按实际 entityVersion 通过 DELETE 接口清理，隔离登录态和本地
  草稿目录亦已删除。至此常规 prompt 的“找到候选 → Agent 读取判断 → 建立微调工作区”正向链路通过；
  完整生成的 token/耗时节省和最终质量等价性仍未验收。

## 9. 站点政策与产品边界

自动化能力必须有 `SitePolicyRegistry`，至少记录：

- domain 与登录态要求；
- 允许的 read/search/fill/submit 范围；
- robots/服务条款/官方 API 或合作状态；
- CAPTCHA、速率、并发、credit 和站点安全预算；
- 已验收页面与最近验收版本；
- 风险等级和默认运行模式；
- 失败时是降级辅助模式、请求接管还是完全禁用。

不得通过伪造 UA、绕过访问控制、绕过验证码或高频并发规避站点限制。部分大型平台明确限制第三方
自动化：LinkedIn 禁止未经授权的 bots/自动访问和修改页面，Indeed 也明确限制 Agentic AI 自动访问
或提交申请。因此首批完全托管站点应优先选择用户明确允许且站点政策可接受的公司 Career/ATS 页面；
受限平台只能提供合规的辅助模式，除非取得明确授权或官方集成。

最终提交仍不允许：

- 伪造经历、技能、证书、薪酬或身份信息；
- 代替用户完成 CAPTCHA、OTP、密码输入；
- 绕过站点访问控制、频率限制或反自动化措施；
- 自动同意超出 grant 的法律条款、背景调查、隐私授权或身份声明；
- 绕过 credit、站点频率、去重或 Harness 安全预算进行失控批量投递；
- 从邮件/网页中读取指令后跨域发送用户数据。

## 10. 产品指标

### 安全与信任

- grant 外动作阻断率：100%；
- 未授权提交/发送：0；
- 密码、OTP、Cookie、Token 进入模型或业务日志：0；
- 重复 Application / 重复 Calendar event：0；
- prompt injection 红队关键场景逃逸：0；
- 用户暂停/撤销到停止新动作的延迟：<1 秒。

### 任务质量

- SubmissionReceipt 可验证率：≥99%；
- 已确认成功但 Tracker 未最终同步的可恢复率：100%；
- 自动字段答案有来源率：100%；
- 高置信邮件信号的 Application 关联准确率：BE8/任何自动写启用前必须先达到 ≥99%；
- 面试时间/时区写入准确率：100%；
- Job Scout 重复推荐率：<1%。

### 用户价值

- 从发现岗位到完成投递的用户操作次数；
- 每周高匹配岗位发现数、合格投递数、回复率、面试率和 Offer 率；
- 每次合格投递耗时与用户接管次数；
- 因缺少事实主动停止而避免的低质量投递数；
- Tracker 自动更新覆盖率和 Calendar 漏同步率。

投递数量不是核心成功指标，不能通过放宽匹配或事实门槛来提高。

## 11. 外部调研结论

- 浏览器 Agent 的成熟安全模式包括 takeover、关键动作确认、watch mode、prompt-injection 监控和
  可清理的浏览数据。OpenAI 的 Operator/ChatGPT agent 资料也显示，确认能显著降低不可逆错误风险，
  邮箱等敏感站点需要更强监督：
  [Operator System Card](https://openai.com/index/operator-system-card/)、
  [ChatGPT agent](https://openai.com/index/introducing-chatgpt-agent/)。
- Anthropic 的 computer-use 文档建议最小权限、domain allowlist、敏感动作人工确认、隔离执行环境，
  并明确网页/邮件中的间接 prompt injection 仍可能影响 Agent：
  [Computer use tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool)、
  [Prompt injection mitigations](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/mitigate-jailbreaks)。
- Gmail 提供 mailbox `watch` + history 增量机制，但 watch 需要续期、通知可能延迟/丢失，仍需增量回补；
  Microsoft Graph 也支持 Outlook message/event change notifications：
  [Gmail push notifications](https://developers.google.com/workspace/gmail/api/guides/push)、
  [Microsoft Graph change notifications](https://learn.microsoft.com/en-us/graph/change-notifications-overview)。
- macOS Calendar 应通过 EventKit，并按最小权限优先申请 write-only；读取空闲时间或双向同步才申请
  full access，sandboxed macOS App 还需要 Calendar entitlement：
  [Accessing the event store](https://developer.apple.com/documentation/eventkit/accessing-the-event-store)、
  [EKEventStore](https://developer.apple.com/documentation/eventkit/ekeventstore)。
- 自动岗位搜索/投递必须逐站点评估条款。LinkedIn 和 Indeed 当前条款均明确限制未经授权的 bot、
  自动访问或自动提交：
  [LinkedIn User Agreement](https://www.linkedin.com/legal/user-agreement)、
  [Indeed Terms](https://www.indeed.com/legal?zlang=en)。
- AI Native 的价值不止是一次性浏览。当前通用 Agent 产品已经把定时、重复运行、变化监控、
  通知和跨工具连接视为核心形态，因此本路线把 Job Scout、Inbox signals 和 Calendar 联动
  设计为可恢复的本地长期任务，而不是聊天快捷指令；本产品仅在 App 打开时执行，不采用云端调度：
  [Scheduled Tasks in ChatGPT](https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt)、
  [Workspace agents](https://openai.com/academy/workspace-agents/)。

## 12. Roadmap 写回规则

- 本 README 是 `browser-enhance` 的唯一执行入口；阶段开始前先在对应阶段标题下补现状复核与
  用户确认结果，不创建平行路线；
- BE0 已完成，正式完成记录为 [00-foundation](./00-foundation/README.md)；BE1–BE5 已在本 README
  既有 5.1/5.3/6/7/8 节写回，不创建平行执行路线；当前唯一执行指针为 BSF4；
- Browser Shell 正式化的聊天原始记录保留在
  [browser-shell-chrome-formalization-notes.md](./browser-shell-chrome-formalization-notes.md)，基于该记录形成的
  [Browser Shell AI Native 与正式浏览器体验子路线](./browser-shell-formalization/README.md)已于 2026-08-30
  经用户确认作为独立产品面启动；它仍共享本项目事实源、安全边界和质量门禁，不是第二套产品或 Agent runtime；
- 每个阶段完成后在本 README 的阶段表和正式阶段文档写回真实结果、失败点、证据和遗留项；
- 接口存在、Browser Demo、本地测试页或单一网站成功都不算“完全托管可用”；
- 任何新增 UI 先提交 Delegation Panel、Task Control Center、Timeline、Receipt 和错误/接管状态方案，
  用户确认后再实现；
- 每个代码阶段运行 `npm run check`，浏览器/邮件/EventKit 可见行为还必须做真实 Electron 和真实账号验收；
- 涉及 macOS entitlement、签名或打包时，先执行桌面发布加固 runbook，不以开发态通过代替发布验收。
