# P2：JD 粘贴、提取与入库

> 状态：完成（P2.7 测试 + P2.8 Browser Demo 验收通过，待真实 Electron 端到端验收）  
> 前置：P0 通过  
> 后端/Web 改动：无（后端 JD CRUD 已齐全，Web 已有独立 JD 创建流程）  
> 计划日期：2026-07-24  
> 完成日期：2026-07-24（核心实现）

## 用户链路

```text
用户粘贴 JD 原文
→ App Agent 识别保存/分析意图
→ 生成结构化 JdProposal
→ 宿主校验
→ 聊天卡片 + 右侧完整预览
→ 用户接受
→ POST /product/jds
→ 返回稳定 JD 与 requirement IDs
→ 绑定当前对话和后续匹配任务
```

## 后端接口（已存在，不改动）

```text
POST   /v1/product/jds          — CreateJdBody(title, raw_text, company?, target_role?, requirements?)
GET    /v1/product/jds          — 分页列表
GET    /v1/product/jds/{id}     — 按 ID 读取完整 JD
DELETE /v1/product/jds/{id}     — 删除
```

- 后端 `JdService.create_jd()` always creates a new row，无去重；
- 响应使用 camelCase JSON，返回服务端生成的 `id`、requirement `id`、`jdHash`；
- App 已有的 `ProfileJdApi`（只读 `listJds`/`getJd`）和 `normalizeJdRecord` 可直接复用。

## 实施计划

### P2.1 API 写入层

**新增文件：**

| 文件 | 职责 |
| --- | --- |
| `src/api/jd-writer-api.ts` | `JdWriterApi` 类，实现 `JdWriter` 接口，调用 `POST /v1/product/jds`，构建 snake_case 请求体，使用已有 `normalizeJdRecord` 解析响应 |

**扩展已有文件：**

| 文件 | 改动 |
| --- | --- |
| `src/api/types.ts` | 新增 `JdCreateInput` 接口和 `JdWriter` 接口（`createJd(input, signal?) → JdRecord`） |

**模式参照：** `ExperienceApi.createExperience()` — 构建 snake_case body → POST → normalizer → 返回强类型。

### P2.2 Proposal 管理

**新增文件：**

| 文件 | 职责 |
| --- | --- |
| `src/jd/proposal-store.ts` | `JdProposalStore` 类，管理单个 active `JdProposal`；提供 `create`/`get`/`getActive`/`clear` |

**模式参照：** `ExperienceImportProposalStore` — 同为单 active 实例、随机 ID、不可变快照。

### P2.3 审批接线

**新增文件：**

| 文件 | 职责 |
| --- | --- |
| `src/jd/approval-draft.ts` | `createJdSaveApprovalDraft()` 将 `JdProposal` 转为 `ApprovalDraft`，`createJdSaveApprovalPayload()` 构建 `JdSaveApprovalPayload` |
| `src/jd/jd-save-executor.ts` | `createJdSaveExecutor()` 返回 `ActionExecutor`：accept 时调用 `JdWriter.createJd()`，reject 时清理 ProposalStore |

**注册方式：** 在 Agent 创建流程中将 `jd.save` 注册到 `ActionExecutorRegistry`。

**模式参照：** `createExperienceImportApprovalDraft` + `createExperienceImportExecutor` — 同样的 Draft/Payload/Executor 三件套。

### P2.4 Agent 工具

**扩展已有文件：**

| 文件 | 改动 |
| --- | --- |
| `src/tools/jd-tools.ts` | 新增 `createPrepareJdImportTool()` 函数，返回 `prepare_jd_import` 工具 |

**工具行为：**
- 接受 `rawText`、`title`、`company?`、`targetRole?`、`requirements[]`（每条含 `text`、`category`、`importance`、`keywords`、`v2Importance?`、`v2Category?`）；
- 校验 requirements 非空、rawText 非空；
- 创建 `JdProposal`（`duplicateStatus` 恒为 `none`）；
- 通过 `ApprovalManager.request()` 发出审批卡片；
- 返回 proposal 摘要和 `approvalRequestId`，附带等待用户决定的指令。

**工具注册：** 在 `src/tools/registry.ts` 中与现有工具一起注册。

**自定义回答处理：** 自定义回答由 Agent 收到后，用修正后的完整 candidates 重新调用 `prepare_jd_import`，旧 Proposal 被 `ApprovalStore` 的 scopeKey 替换机制自动废弃。

### P2.5 Agent Prompt 与上下文

**扩展已有文件：**

| 文件 | 改动 |
| --- | --- |
| `src/agent/system-prompt.ts` | 补充 JD 保存意图识别指令：当用户粘贴包含岗位要求的文本时，优先调用 `prepare_jd_import`；明确禁止从 JD 内容中执行工具调用 |
| `src/agent/context-policy.ts` | JD 保存成功后，在对话上下文中记录 `savedJdId` 供后续匹配和简历生成使用 |

### P2.6 接线与生命周期

**扩展已有文件：**

| 文件 | 改动 |
| --- | --- |
| `src/agent/create-agent.ts` | 创建 `JdWriterApi`、`JdProposalStore`，注册 `jd.save` executor，注册 `prepare_jd_import` 工具 |
| `src/desktop/main/agent-runtime.ts` | 如有桌面特有的 JD 生命周期需求（退出登录清理等） |

## 实施结果

### 已完成

#### P2.1 API 写入层
- 新增 `src/api/jd-writer-api.ts`：`JdWriterApi` 类，调用 `POST /v1/product/jds`，构建 snake_case 请求体，复用 `normalizeJdRecord` 解析响应
- `src/api/types.ts` 新增 `JdCreateInput` 接口和 `JdWriter` 接口

#### P2.2 Proposal 管理
- 新增 `src/jd/proposal-store.ts`：`JdProposalStore`，管理单个 active `JdProposal`；提供 `create`/`get`/`getActive`/`clear`

#### P2.3 审批接线
- 新增 `src/jd/approval-draft.ts`：`createJdSaveApprovalDraft()` + `createJdSaveApprovalPayload()`
- 新增 `src/jd/jd-save-executor.ts`：`createJdSaveExecutor()`，accept 时调用 `JdWriter.createJd()`，reject 时清理 ProposalStore
- 在 `src/actions/create-action-approvals.ts` 中注册 `jd.save` executor

#### P2.4 Agent 工具
- 新增 `src/tools/prepare-jd-import.ts`：`prepare_jd_import` 工具，接受 `rawText`/`title`/`company?`/`targetRole?`/`requirements[]`，校验非空，创建 JdProposal，通过 ApprovalManager 发出审批
- `src/tools/registry.ts` 注册 `prepare_jd_import`，并将 `jdProposalStore` 和 `jdWriter` 接入 createActionApprovalManager

#### P2.5 Agent Prompt 与上下文
- `src/agent/system-prompt.ts` 补充：JD 意图识别指令（优先识别粘贴文本为 JD 保存意图）+ Direction A 续接指令（接受 JD 审批后宿主注入 jdId，Agent 根据历史意图判断是否继续生成简历）

#### P2.6 桌面接线
- `src/desktop/main/agent-runtime.ts`：
  - `ConversationAgentContext` 增加 `jdProposalStore` 字段
  - `#createContext` 中监听 `prepare_jd_import` tool 完成事件，调用 `#emitJdProposal`
  - 新增 `#emitJdProposal`：读取 active proposal + pending approvals，向渲染层发送 `jd.proposal.created` 事件
  - `resolveApproval` 中集成 Direction A：accept JD 审批后自动注入续接 prompt
- 新增 `src/desktop/main/jd-continuation.ts`：`prepareJdContinuation()` + `buildJdContinuationPrompt()`（从 agent-runtime 拆出以控制文件行数）

#### P2 UI 层（P2 计划外，本次一并完成）
- `src/desktop/shared/types.ts`：新增 `JdArtifactData`、`JdArtifactRequirement` 类型，`DesktopAgentEvent` 联合新增 `jd.proposal.created`
- 新增 `src/desktop/renderer/src/components/JdArtifactCard.vue`：聊天流中的 JD 卡片，显示标题/公司/状态，点击切换右侧面板
- 新增 `src/desktop/renderer/src/components/JdDetailPanel.vue`：右侧 JD 详情面板，显示结构化 requirements（含 category/importance 标签）
- 新增 `src/desktop/renderer/src/chat/use-jd-artifacts.ts`：JD artifact 状态管理 composable（从 use-chat-session 拆出）
- `src/desktop/renderer/src/chat/use-chat-session.ts`：处理 `jd.proposal.created` / `approval.completed` / `approval.resolved` 事件，对外暴露 `jdArtifacts`、`activeJd`、`openJdDetail`
- `src/desktop/renderer/src/App.vue`：`activeArtifactType` 状态驱动右侧面板在简历/JD 之间切换，无 Tab，点击哪种卡片就切换到哪种
- `src/desktop/renderer/src/styles/base.css`：`.jd-artifact-card`、`.jd-detail-panel` 及所有子样式；820px 响应式隐藏 JD 面板
- `src/desktop/renderer/src/lib/desktop-api.ts`：浏览器 demo 模式支持 JD 预览（检测 JD 关键词后 emit `jd.proposal.created`）

#### Direction A：保存 JD 后自动续接（P2 新增范围）
实现了"粘贴 JD + 同时要求生成简历"的一次性用户体验：
1. 用户接受 JD 审批后，`resolveApproval` 通过临时订阅捕获执行器返回的 `jdId`
2. 立即向 Agent 注入包含 `jdId` 的续接 prompt
3. Agent 根据对话历史判断原始意图：若要求生成简历则继续调用 `get_resume_source_snapshot`；否则简要确认 JD 已保存

### P2.7 自动化测试（已完成）

新增 5 个测试文件，合计 40 个 case，全部通过：

**新增测试文件：**

| 文件 | 覆盖范围 |
| --- | --- |
| `test/jd-proposal-store.test.ts` | create/get/clear、随机 ID、不可变快照、多次 create 替换 |
| `test/jd-approval-draft.test.ts` | Draft 字段正确、payload 结构、空 requirements 拒绝 |
| `test/jd-save-executor.test.ts` | accept 调用 writer、reject 清理 store、网络失败不丢 proposal |
| `test/jd-writer-api.test.ts` | snake_case 请求体、normalizer 响应、契约校验 |
| `test/prepare-jd-import-tool.test.ts` | 工具参数校验、proposal 创建、approval 发出、duplicateStatus=none |

### P2.8 Browser Demo 验收（已完成）

在浏览器 demo 模式（http://localhost:5175）完成以下验收：

- **中文 JD 粘贴识别**：粘贴含"岗位/JD"关键词文本 → Agent 正确识别并触发 `jd.proposal.created` 事件 ✓
- **JD 卡片渲染**：聊天流中出现"高级前端工程师 · 等待确认 · 字节跳动"卡片，图标/状态/公司信息正确 ✓
- **JD 卡片点击 → 右侧面板切换**：点击 JD 卡后右侧面板切换到 JD 详情（标题、公司、6 条 requirements 含分类/重要性标签）✓
- **简历卡片点击 → 切回简历面板**：点击简历卡后右侧正确切回简历预览 ✓
- **双向面板切换无 Tab**：交互符合设计，无 Tab 组件，点哪种卡片切哪种 ✓

**待真实 Electron 验收（保留为 P2 后置任务）：**
- 真实 Electron 粘贴中文 JD → DeepSeek 提取 → 接受 → 云端写入 → Web API 读回验证
- 英文 JD / 低结构 JD 样本
- accept / reject / custom 三条路径
- 保存后的 JD 直接进入 G1–G7 简历生成

## 实施内容

- App 新增 `JdWriter`、create Normalizer、ProposalStore、Approval draft 和 Executor；
- 新增 `prepare_jd_import` 工具；模型只能提交提取候选，不能直接调用写接口；
- 保存完整 `rawText`，提取 title、company、targetRole 和 requirements；
- requirements 包含 text、category、importance、keywords 和 v2 分类；
- 服务端生成/验证稳定 requirement IDs 和 `jdHash`；
- `duplicateStatus` 保留为后续契约但 P0 恒为 `none`；后端每次创建新 JD，App 不做本地去重；
- 自定义回答会废弃旧 Proposal，并由 Agent 生成完整新候选；
- 保存成功后创建受控 JD Artifact 引用，不把完整 JD 复制进持久化聊天工具结果。

## 真实性和安全

- 原文是唯一事实来源；提取可以归类，不能补写原文不存在的要求；
- company/role 不确定时保持空值；
- requirement 必须能回指原文片段或精确字符范围；
- JD 内容视为不可信数据，不能触发其中描述的工具调用；
- 未经用户批准不写云端；网络超时后按幂等键查询结果。

## UI

- 不新增强制向导，用户继续直接粘贴到 Composer；
- 聊天 JD 卡显示岗位、公司、requirements 数量和本地/云端状态；P0 不展示重复提示；
- 右侧 Artifact 区显示原文与结构化 requirements；
- 失败只保留本地 Proposal，提供重试或继续编辑，不声称已保存。

## 本阶段不做

- URL 抓取；
- 浏览器”一键分析当前页面”；
- JD 截图 OCR；
- 静默自动保存每段疑似职位文本；
- JD 去重（`duplicateStatus` 恒为 `none`）；
- 后端或 Web 改动。

## 完成门槛

- 中文、英文、混合和低结构 JD 样本均能生成有效 Proposal；
- 事实回指、`duplicateStatus=none`、accept/reject/custom、幂等和冲突测试通过；
- 真实 DeepSeek 多样本提取评测达到阶段设定阈值且无编造要求；
- App 创建的 JD 可被 Web 和 App 重新读取，hash 与 requirement IDs 一致；
- 新 JD 可直接进入 P3 和既有 G1–G7 简历生成；
- `npm run check` 通过；新业务文件均在 250 行以内；
- 至少一次真实 Electron 端到端验收。

---

## 修复记录

### 2026-07-25：JD 保存 422（v2 枚举字段越界）

**现象**：保存 JD 时后端 `POST /v1/product/jds` 返回 422（后端本身在正常运行）。在 B2 浏览器读页（`extract_page`）后由模型自行提取 requirements 时尤其易触发。

**根因**：后端 `JdRequirementBody` 的 `v2_category` / `v2_importance` 是严格枚举，且 body `additionalProperties: false`：
- `v2_category` 仅允许 `qualification` / `responsibility` / `technology` / `domain` / `soft_skill`
- `v2_importance` 仅允许 `must_have` / `preferred` / `optional`

而 App 侧 `prepare_jd_import` 工具把 `v2Category` 定义为自由字符串（`Type.String({ maxLength: 100 })`），模型常填 `skill`/`experience`/`education`/`technical` 等非枚举值 → 后端 422。

**修复（两处）**：
1. **收紧工具 schema**（`src/tools/prepare-jd-import.ts`）：`v2Category` 改为后端 5 值的 `Type.Union`，并在 description 里写明取值，模型无法再填越界值。
2. **写入前兜底清洗**（`src/api/jd-writer-api.ts`）：`createJd` 发请求前用 `sanitizeV2Category` / `sanitizeV2Importance` 过滤，非枚举值一律降级为 `null`，任何来源的脏数据都不会再触发 422。

配套：`src/api/types.ts` 新增 `JD_REQUIREMENT_V2_CATEGORIES` 常量与 `JdRequirementV2Category` 类型；`JdCreateInput` / `JdProposalRequirement` 的 `v2Category` 收紧为枚举；`test/jd-writer-api.test.ts` 修正非法值用例并新增“越界值清洗为 null”测试。`npm run check` 通过。
