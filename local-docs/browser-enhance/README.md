# Browser Enhance：Agent 托管浏览器路线

> 状态：产品与架构初稿；2026-08-20 已确认 Agent-native Harness 总体方向，BE0 产品参数待确认
> 建立日期：2026-08-20
> 前置基线：[浏览器自动填写路线](../browser-autofill-roadmap/README.md) B0–B5、
> [P0 产品能力补齐路线](../p0-product-completion-roadmap/README.md) S3–S4
> 路线关系：本路线是 `browser-autofill-roadmap` 的正式后继；旧路线保留为已实现原语与历史决策，
> 未完成的 B6 集成交付由本路线 BE4、BE5、BE8 吸收，不再单独推进
> 执行约束：本次只建立规划，不改变 P0 主路线当前的 S4.5 → S5 → R1 顺序；若用户决定启动
> BE0，需先在 P0 主 README 写回新的执行顺序

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

- `CooltoAgent`、`pi-agent-core`、context compaction、重复保护、turn governor 和取消传播；
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

### 2.4 已确认的 Agent-native Harness 决策

> 用户于 2026-08-20 确认：能复用的必须复用；新增能力必须在现有架构上延伸；禁止重复造轮子；
> 禁止由宿主编排岗位搜索、投递、Tracker、邮件或 Calendar 业务流程。

唯一总原则：**Agent 决定做什么、为什么做和下一步是什么；Harness 只提供能力、执行动作、
校验授权、持久化状态并返回真实结果。**

| 层 | 允许职责 | 禁止职责 |
| --- | --- | --- |
| Agent | 感知、规划、比较、选择工具、判断结果、决定继续/等待/追问/结束 | 扩大授权、绕过工具、把网页指令当系统约束 |
| Task Harness | Agent 生命周期、checkpoint、事件邮箱、定时唤醒、工具暴露、取消、资源上限 | 理解求职阶段、选择岗位、决定投递顺序、根据邮件直接改状态 |
| Policy Reference Monitor | 对 Agent 提出的动作执行 `allow / block / ask`，签发一次性 token | 替 Agent 选择动作、生成业务答案、静默扩大 grant |
| Adapter / Store | 执行原子 I/O、规范化真实结果、Proposal/Outbox/乐观锁 | 串联搜索→填写→提交→追踪流程，建立第二套业务事实 |

硬性架构约束：

1. 继续使用同一个自然语言 Agent 和 `pi-agent-core` 的 model → tool → model 循环；不增加 planner、
   规则模型或第二个业务 Agent；
2. 扩展 `DesktopAgentRuntime` 为可承载 conversation 和持久化 `AgentTask` 的通用 Harness，
   不新建 Browser 专属 Agent runtime；
3. 浏览器、邮件、Calendar 和 Tracker 都是能力 Adapter/工具或环境事件源，不拥有业务工作流；
4. 工具保持原子、可组合、幂等、可审计；禁止新增 `auto_apply_job`、`run_campaign`、
   `process_recruiting_email`、`advance_application_pipeline` 等隐藏流程的宏工具；
5. 允许 `prepare_application_create`、`prepare_interview_create` 这类原子语义 Proposal 工具，
   但何时调用、参数是什么、调用后做什么必须由 Agent 决定；
6. 定时器、邮件增量、Calendar 变化和浏览器状态变化只写入通用事件邮箱并唤醒同一个 Agent；
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
- 通用事件邮箱、timer wake-up、崩溃恢复和任务锁；
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
- `submissionBudget`：单次/单日最大岗位数、最低匹配门槛、同公司频率和去重规则；
- `expiresAt`、空闲时限、是否允许无人值守；
- `createdByUserAt`、界面版本、政策版本和不可变内容 hash。

### 3.3 动作风险等级

| 等级 | 例子 | 完全托管下的处理 |
| --- | --- | --- |
| R0 只读 | 搜索、读页、切标签、比较岗位 | grant 范围内自动执行 |
| R1 可逆写 | 填字段、选择选项、保存草稿、创建本地 lead | grant 范围内自动执行并记录 |
| R2 外部承诺 | 提交申请、发送求职邮件、更新 Tracker、创建 Calendar event | 仅在 grant 明确包含该动作时自动执行 |
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
- 后台持续同步优先使用官方 Gmail API / Microsoft Graph，按最小权限读取增量事件；
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

## 6. 更 AI Native 的场景池

以下不是普通浏览器宏，而是基于 Coolto 已有 Experience、JD、Resume、Tracker 事实形成的差异化能力。

### P0：应并入本路线

1. **Job Scout Campaign**
   定时巡视用户允许的岗位源，只报告新增、变更或截止的高匹配岗位；记住上次运行结果，避免重复。

2. **质量优先的自动投递策略**
   不按数量盲投。Agent 在每日预算内按 match、证据充足度、Resume 是否可交付、公司偏好和重复风险
   排序；不达门槛就不投，并解释为什么没有用完额度。

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
| BE3 | Managed Job Scout | 多源搜索、BrowserLead、去重、匹配、Shortlist、定时增量 | 真实允许站点连续运行；重复 lead <1%；所有入选/排除理由可追溯 |
| BE4 | Managed Apply + Tracker | 多页填表、Answer Vault、SubmissionToken/Receipt、Application Proposal | 自动提交仅发生在有效 grant；错误投递/重复 Application 为 0；实际 JD/Resume/hash 冻结正确 |
| BE5 | Inbox Signals | Gmail/Outlook 增量、求职邮件分类、状态/Interview Proposal | 原始邮件不越界持久化；错误自动迁移为 0；模糊信号进入确认队列 |
| BE6 | macOS Calendar | EventKit 权限、单向写入、映射、改期/取消；可选双向 | 拒绝权限可降级；无重复 event/同步回环；时区和重启恢复通过 |
| BE7 | AI Native Loops | Scout 调度、Follow-up、Briefing、Strategy Learner、风险提醒 | 每项有独立开关、停止条件、通知去重和效果指标 |
| BE8 | 真实集成交付 | 真实账号/站点、长任务、断网、崩溃、跨账号、安全与发布验收 | 完整矩阵通过前不得宣称“完全托管可用” |

正式执行顺序：

```text
BE0 → BE1 → BE2 → BE3 → BE4 → BE5 → BE6 → BE7 → BE8
```

BE0、BE1、BE2 是任何自动提交的硬前置；不得先开放 submit 再补 consent 或审计。

## 8. 分阶段关键验收

### BE0：架构冻结与产品取舍

- 冻结本 README 2.4 的 Agent/Harness/Adapter 职责，代码评审拒绝宿主业务状态机、宏工具和
  Browser/Mail/Calendar 专属 Agent runtime；
- 建立现有 `CooltoAgent`、`DesktopAgentRuntime`、ToolRegistry、Browser、Proposal/SyncStore 的
  逐项复用清单；新增模块必须说明现有能力为什么不能延伸，不能仅因命名或调用不方便而复制；
- 定义统一环境事件、工具元数据、任务 terminal tool 与 checkpoint contract；
- 完全托管的默认单日投递上限和最低匹配门槛；
- 首批允许自动搜索/投递的站点和明确禁用站点；
- 哪些表单字段允许持久化到 Answer Vault；
- 自动提交是否覆盖求职邮件发送，还是邮件始终单次确认；
- Gmail 与 Outlook 的接入优先级；
- Calendar 先只写还是首版就读写；
- 本地截图/回执的保留周期与“一键清除”语义；
- App 关闭、休眠或网络断开时，托管任务是暂停还是允许后台常驻。

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

### BE5–BE6：联动门禁

- 邮件信号先关联 Application，再提出状态迁移；不能按公司名模糊匹配就静默写入；
- 后端非法状态迁移必须保留服务端错误，不能由 Agent 绕过；
- 面试邮件的日期、时区、轮次或会议链接不完整时先确认；
- EventKit 权限拒绝或被撤销不影响 Tracker 主流程；
- Calendar event 删除不能自动删除 Interview 事实，只能生成变更 Proposal；
- Tracker/Calendar 任一侧变更都携带 source identifier，防止来回创建。

## 9. 站点政策与产品边界

自动化能力必须有 `SitePolicyRegistry`，至少记录：

- domain 与登录态要求；
- 允许的 read/search/fill/submit 范围；
- robots/服务条款/官方 API 或合作状态；
- CAPTCHA、速率、并发和每日预算；
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
- 无上限批量投递、重复投递或明显不符合条件的岗位；
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
- 高置信邮件信号的 Application 关联准确率：先达到 ≥99% 才允许自动写；
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
  设计为长期任务，而不是聊天快捷指令：
  [Scheduled Tasks in ChatGPT](https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt)、
  [Workspace agents](https://openai.com/academy/workspace-agents/)。

## 12. Roadmap 写回规则

- 本 README 是 `browser-enhance` 的唯一执行入口；阶段开始前先在对应阶段标题下补现状复核与
  用户确认结果，不创建平行路线；
- 当前仅建立总路线。用户确认 BE0 后，才按阶段创建 `00-foundation/`、`01-agent-control/` 等正式
  阶段目录；不预建空文档；
- 每个阶段完成后在本 README 的阶段表和正式阶段文档写回真实结果、失败点、证据和遗留项；
- 接口存在、Browser Demo、本地测试页或单一网站成功都不算“完全托管可用”；
- 任何新增 UI 先提交 Delegation Panel、Task Control Center、Timeline、Receipt 和错误/接管状态方案，
  用户确认后再实现；
- 每个代码阶段运行 `npm run check`，浏览器/邮件/EventKit 可见行为还必须做真实 Electron 和真实账号验收；
- 涉及 macOS entitlement、签名或打包时，先执行桌面发布加固 runbook，不以开发态通过代替发布验收。
