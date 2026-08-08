# Coolto 架构与实施计划

> 状态：讨论草案  
> 版本：v0.5  
> 日期：2026-07-23  
> 说明：本文档用于逐步确认 Coolto 的技术架构和实施顺序。未确认内容不视为最终决策。

## 1. 当前共识

Coolto 同时提供 Web 端和桌面 App。

两端使用同一个账号体系和同一个后端，但只共享用户的“固定资产数据”。

当前确定需要共享的固定资产包括：

- 经历。
- JD。
- 简历及简历版本。
- 投递记录。
- 与上述数据直接关联、并被用户确认保存的材料。

聊天记录、Agent 运行状态、Agent 工具调用记录和临时生成内容不在 Web 与桌面 App 之间共享。

云端数据库是固定资产的唯一权威数据源。V1 不在桌面 App 中持久化缓存固定资产。

现有后端的 FastAPI、LangGraph 和相关业务能力继续保留，用于：

- 支持 Web 端 Agent。
- 支持云端复杂工作流。
- 保存和共享固定资产数据。

桌面 App 不调用云端 LangGraph。桌面端的 Agent 能力全部由本地 Pi Agent 提供。

## 2. 最小总体架构

```text
Web 端
  └─ 调用云端 FastAPI / LangGraph

桌面 App
  ├─ 运行本地 Pi Agent
  ├─ 通过业务 API 访问固定资产数据
  └─ 只保存本地私有数据

云端后端
  ├─ 账号与登录
  ├─ 固定资产业务 API
  ├─ Web 端 LangGraph Agent
  ├─ PostgreSQL
  ├─ 文件存储
  └─ LLM 调用
```

## 3. 数据原则

### 3.1 云端数据

以下数据以云端为准：

- 用户账号。
- 个人经历。
- 经历相关材料。
- JD。
- 简历和简历版本。
- 投递记录。
- 与上述数据关联并确认保存的材料。

Web 端和桌面 App 都通过后端 API 访问这些数据。客户端不直接连接 PostgreSQL。

云端不负责保存桌面 Pi Agent 的聊天记录、运行状态和工具调用过程。

### 3.2 本地数据

桌面 App 只持久化保存本地私有数据：

- 本地 Pi Agent 聊天记录和运行状态。
- 本地 Pi Agent 工具调用记录。
- 尚未确认保存为固定资产的临时生成内容。
- 尚未上传的本地文件。
- 内置浏览器的本地状态。
- App 设置。
- 招聘网站 Cookie 和 Session。
- 用户主动下载或导出的文件。

登录 Refresh Token 单独保存在操作系统安全存储中。

本地 Pi 聊天和临时内容中可能包含部分经历、JD 或简历信息，因此本地私有数据仍应加密保存。

本地聊天记录、Pi Agent 状态和其他本地私有数据不上传云端，删除后不能从云端恢复。

### 3.3 同步边界

只允许以下数据参与 Web 与桌面 App 之间的同步：

- 经历。
- JD。
- 简历及简历版本。
- 投递记录。
- 已确认保存并与固定资产关联的材料。

以下数据明确不参与同步：

- Web 端聊天记录。
- 桌面端聊天记录。
- LangGraph Checkpoint。
- Pi Agent Session 和内部状态。
- Agent 工具调用过程。
- 思考过程和过程事件。
- 临时匹配分析。
- 尚未保存为正式简历或其他固定资产的临时内容。

### 3.4 明确不从后端获取的数据

桌面 App 不从后端获取以下 Web 端私有数据：

- Web 端聊天记录。
- Web 端 LangGraph Checkpoint。
- Web 端 Agent 运行过程。
- Web 端工具调用记录。
- Web 端临时生成但未保存的内容。
- Web 端页面和界面状态。

桌面 App 也不向后端上传：

- 本地 Pi 聊天记录。
- Pi Agent Session。
- Pi 工具调用过程。
- 本地思考和过程事件。
- 内置浏览器的浏览历史和临时页面状态。

### 3.5 V1 如何访问固定资产

桌面 App 的页面和本地 Pi Agent 都通过后端业务 API 按需获取固定资产。

典型访问方式：

```text
用户或 Pi 发起任务
  → 调用本地 Repository
  → Repository 请求后端业务 API
  → 后端读取 PostgreSQL
  → 返回当前最新数据
```

本地 Repository 用于隔离 UI、Pi Agent 和网络实现。V1 的 Repository 直接请求后端；以后如需增加持久化缓存，可以替换 Repository 实现，而不修改 UI 和 Pi 工具。

### 3.6 运行期间的内存缓存

V1 只允许在 App 当前运行期间使用短期内存缓存，不写入固定资产本地数据库。

可以暂存在内存中的内容包括：

- 当前用户基础资料。
- 当前页面展示的经历、JD、简历和投递记录。
- 当前 Pi 任务已经查询的固定资产。
- 当前正在使用的附件元数据。

建议默认有效期为 5 至 10 分钟。以下情况立即重新请求后端：

- 用户主动刷新。
- 开始生成或修改简历。
- 开始分析 JD。
- 开始自动填写招聘表单。
- 更新投递状态。
- 后端返回版本冲突。

App 退出、账号退出或切换账号后，相关内存数据立即清除。

后端 API 可以使用版本号、`ETag` 和 `If-None-Match` 减少没有变化时的重复传输。

### 3.7 附件和临时文件

附件内容不自动下载。只有以下情况才临时获取：

- 用户主动打开或下载。
- 本地 Pi 当前任务需要解析。
- 简历导出或投递填表需要使用。

仅用于解析的文件放入临时目录，任务结束后清理。

用户主动下载、导出或明确选择保留的文件属于用户文件，不视为固定资产缓存。

### 3.8 本地修改如何写入云端

固定资产修改直接写入后端：

1. 用户或 Pi Agent 发起修改。
2. App 调用对应的后端业务 API。
3. 后端完成账号权限和数据校验。
4. 后端写入 PostgreSQL。
5. 后端返回最新数据和版本号。
6. App 更新当前内存状态。

后端请求失败时：

- 不把修改标记为已保存。
- 可以保留本次本地编辑草稿。
- 提示用户重新提交。
- 草稿不与 Web 端共享。

V1 不实现固定资产离线写入、离线队列和冲突合并。

### 3.9 删除和退出

固定资产删除直接调用后端业务 API，并以服务端结果为准。

用户退出账号或切换账号时：

- 清除全部固定资产内存数据。
- 清除 Access Token。
- 关闭当前 Pi Session。
- 是否删除本地 Pi 聊天和其他本地私有数据，由退出界面的用户选项决定。

## 4. Agent 原则

### 4.1 云端 LangGraph

现有 LangGraph 不删除，主要支持：

- Web 端 Agent。
- 云端复杂任务。
- 需要持久化和恢复的工作流。

LangGraph 只服务 Web 端，不作为桌面 App 的能力或兜底。

### 4.2 本地 Pi Agent

桌面 App 的全部 Agent 能力由本地 Pi Agent 提供。

本地 Pi Agent 可以承担：

- 通过业务 API 查询和整理云端经历。
- 解析用户本地文件。
- 分析 JD。
- 生成和修改简历。
- 使用桌面端内置浏览器。
- 读取招聘页面并辅助填写表单。
- 使用系统通知等桌面能力。

Pi Agent 通过后端业务 API 读取和写入固定资产数据，但不调用后端 LangGraph。

Web LangGraph 与桌面 Pi 可以采用不同的实现方式，只要求它们最终写入的固定资产满足相同的数据结构和业务校验。

## 5. 初步技术选型

| 部分 | 初步方案 | 状态 |
|---|---|---|
| Web 前端 | Vue 3 + TypeScript | 待确认 |
| 桌面 App | Electron + Vue 3 + TypeScript | 待验证 |
| 本地 Agent | Pi Agent Core | 待验证 |
| 云端后端 | Python + FastAPI | 保留 |
| 云端 Agent | LangGraph / LangChain | 保留 |
| 云端数据库 | PostgreSQL | 保留 |
| 固定资产本地缓存 | V1 不做持久化缓存，只使用短期内存缓存 | 已确认 |
| LLM | DeepSeek V4 Flash | PRD 已确定，需实测 |

## 6. Agent 内核与桌面能力的边界

Pi Agent Core 提供的是：

- Agent 对话和工具调用循环。
- 流式消息事件。
- Agent 状态。
- 工具注册和参数校验。
- 工具执行前后的拦截。
- 中止、继续和错误处理。

Pi Agent Core 不直接提供：

- Electron WebView。
- 招聘网站登录和 Cookie 管理。
- 网页 DOM 读取和表单填写。
- Gmail OAuth。
- QQ/163 邮箱授权。
- 邮件草稿写入。
- 本地文件选择器。
- 系统通知。

这些能力需要作为独立工具和平台适配器接入 Agent。

### 6.1 Agent 内核

Agent 内核不依赖 Electron，主要包含：

- Pi Agent 初始化。
- System Prompt 和任务 Prompt。
- Tool Registry。
- 固定资产 Repository 接口。
- 工具权限和确认策略。
- Pi 本地 Session 管理。
- 流式事件定义。
- 错误、取消和重试。

Agent 内核应当可以同时运行在 CLI 和 Electron 中。

### 6.2 平台能力接口

Agent 内核只依赖抽象接口，不直接引用 Electron API：

```text
AssetRepository
BrowserAdapter
MailAdapter
FileAdapter
NotificationAdapter
SecureStorageAdapter
```

不同运行环境提供不同实现：

```text
CLI
  ├─ HTTP AssetRepository
  ├─ 本地文件适配器
  ├─ 测试或 Playwright BrowserAdapter
  └─ 测试 MailAdapter

Electron
  ├─ HTTP AssetRepository
  ├─ WebContentsView BrowserAdapter
  ├─ 正式 MailAdapter
  ├─ Electron 文件选择器
  ├─ 系统通知
  └─ 操作系统安全存储
```

## 7. 实施顺序

### 7.1 第一阶段：CLI 跑通 Agent 内核

先建立独立的 Agent Core 包和 CLI，不开发完整 Electron UI。

CLI 需要验证：

1. 用户可以使用现有账号登录。
2. Pi Agent 可以正常流式对话。
3. Pi 可以通过业务 API 查询经历、JD、简历和投递记录。
4. Pi 可以新增或修改经历，并保存到云端。
5. Pi 可以分析 JD。
6. Pi 可以生成结构化简历并保存为云端简历版本。
7. 工具参数可以被 Schema 校验。
8. 写入和删除操作具有确认机制。
9. Pi 聊天和 Session 只保存在本地。
10. 整个 CLI 不调用后端 LangGraph。

CLI 阶段的主要目标是验证 Agent 是否可靠，而不是验证桌面界面。

### 7.2 第二阶段：CLI 验证能力工具

Agent 内核稳定后，再单独验证浏览器和邮件能力。

浏览器可以先使用 Playwright 或测试页面验证：

- Agent 能获取页面字段描述。
- Agent 能生成结构化填表计划。
- 工具能逐项填写。
- 最终提交必须由用户执行。

这一步只能验证网页理解和填表逻辑，不能代替 Electron WebContentsView 的正式验证。

邮件能力可以先在 CLI 中验证：

- 生成邮件标题和正文。
- 选择正确的简历附件。
- 生成 `.eml` 文件。
- Gmail API 创建草稿。
- 不自动发送邮件。

邮件内容生成属于 Agent 能力；OAuth、邮箱 API、`.eml` 写入属于 MailAdapter 能力。

### 7.3 第三阶段：接入 Electron

CLI 验收后，将相同的 Agent Core 包接入 Electron。

Electron 阶段实现：

- Vue 聊天界面。
- Pi 流式事件展示。
- 账号登录和安全存储。
- 本地 Pi Session 管理。
- WebContentsView 内置浏览器。
- 正式 BrowserAdapter。
- 正式 MailAdapter。
- 文件选择和导出。
- 系统通知。

Agent Core、工具 Schema 和业务逻辑不应因为接入 Electron 而重写。

### 7.4 第四阶段：端到端流程

最后串联完整投递流程：

```text
选择或导入 JD
  → 本地 Pi 分析
  → 生成针对性简历
  → 用户确认
  → WebView 自动填表或生成邮件草稿
  → 用户手动提交或发送
  → 保存投递记录到云端
```

## 8. 当前不做的决定

以下问题暂不在 v0.5 中确定：

- 是否支持完全离线使用。
- 是否重构现有后端业务模块。
- 是否修改现有 Web 前端框架。
- 匹配报告是否属于需要共享的固定资产。
- 用户上传的原始附件是否全部同步到云端。
- 未来是否根据性能和离线需求增加持久化固定资产缓存。

这些问题后续在有原型和测试结果后逐项更新本文档。

## 9. 下一步讨论项

下一步只讨论一个问题：

> 除了经历、JD、简历和投递记录之外，还有哪些数据应被定义为 Web 与桌面 App 共享的“固定资产”？

## 10. 版本记录

### v0.5

- 明确 Pi Agent Core 不直接提供 WebView 和邮件能力。
- Agent 内核与 Electron 平台能力通过 Adapter 接口解耦。
- 确定先用 CLI 跑通 Agent 内核。
- CLI 稳定后再验证浏览器、邮件工具和 Electron 集成。
- 明确邮件内容生成属于 Agent，邮箱授权和草稿写入属于 MailAdapter。

### v0.4

- V1 取消固定资产持久化本地缓存。
- 删除 bootstrap、增量游标、离线队列和缓存同步设计。
- 固定资产改为通过后端业务 API 按需访问。
- 只保留 5 至 10 分钟的运行期间内存缓存。
- 附件按需临时下载，任务结束后清理。
- 本地 Pi 聊天、设置和浏览器状态仍作为本地私有数据保存。

### v0.3

- 明确桌面端需要缓存的固定资产内容。
- 明确首次登录、App 启动、回到前台、关键任务前和按需访问时的缓存行为。
- 首版确定采用 HTTPS API 和增量游标，不使用 WebSocket。
- 首版确定在线修改成功后再更新本地缓存。
- 明确附件元数据默认缓存、附件文件按需下载。

### v0.2

- 明确只同步固定资产数据。
- 明确聊天记录和 Agent 状态不跨端共享。
- 明确桌面 App 不调用云端 LangGraph。
- 明确桌面 Agent 能力全部由本地 Pi Agent 提供。

### v0.1

- 建立初始架构草案。
