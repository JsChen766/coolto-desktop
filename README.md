# Coolto

Coolto 是面向求职的桌面 Agent 应用：用自然语言整理经历、分析岗位、生成一页简历、管理投递，并在用户授权范围内浏览招聘站点、搜索岗位与填写申请表。

本仓库是 **开源本地 Desktop**：Electron + Vue 宿主，以及同一套 **TypeScript 本地单 Agent 内核**（Pi Agent Core）。不连接 Coolto 云、不登录、不用 Credit。模型调用走你自己配置的 OpenAI 兼容接口（Base URL + API Key + 模型名）。

产品定位与界面文案一致：**整理经历、分析 JD、生成简历、追踪投递。**

### 开源范围说明

本仓库开源首期以本机主路径为准：BYO LLM、经历 / JD / 简历 / 投递、材料库、托管 Browser 任务（搜岗与表单填写在授权与审批边界内）。下列能力在开源 PRD 中标为延后或增强，**当前 README 与产品文案不宣称已交付**：

- **§8 面试训练 / 模拟面试**（deferred）：投递里可有 Interview 实体、briefing 与日历写入，不等于面试训练产品。
- **§11 浏览器站点字段级记忆**（P2）：Answer Vault 与审批填写 ≠ 站点结构记忆。

站点支持边界见 [`local-docs/site-support-boundary.md`](local-docs/site-support-boundary.md)；阶段证据见 [`local-docs/oss-phase-p1-summary.md`](local-docs/oss-phase-p1-summary.md)。


## 当前能力

桌面端按侧栏提供对话、Agent 任务、经历仓库、求职仓库、材料库和投递追踪。业务事实读本机 projection；写入仍走 Proposal + 宿主审批 + LocalSyncStore / Outbox，但不会 Push/Pull 到 Coolto 云。

### 对话 Agent

- 只有一个 Agent，不使用 Router、LangGraph 或并行业务节点；唯一业务输入是自然语言。
- 模型根据工具描述自行判断是否调用工具。只有缺失信息会使任务无法执行、目标歧义会造成不可逆结果，或安全与权限确认不可省略时，才追问一个最关键的问题。
- 启动后自动进入本机工作区，无需邮箱登录。
- 流式回复、经 DOMPurify 清理的 Markdown、可折叠工具状态，以及「接受 / 拒绝 / 自定义回答」审批卡片。
- 对话按登录用户隔离，由 Electron `safeStorage` 加密后保存在 `userData`。对话内容不上云。
- 中英界面、深浅色、首次使用引导。设置里配置 AI 接口；API Key 只写入本机系统凭据库。

### 经历仓库

经历是独立、可复用的长期事实资产，不永久隶属于 JD、简历或投递。

- 时间线浏览、搜索、筛选、详情、归档 / 恢复、软删除，以及不可变 revision。
- 可从自然语言、粘贴文本、对话附件或用户指定的公开网页沉淀经历。
- 用户主动上传文件、指定网页或直接补充材料时，宿主完成分块和单批次合并，写入对应 Experience 正文并只创建一个 import revision。
- 对话附件支持 PDF、DOCX、TXT、MD，单文件最大 20 MB。PDF 解析依赖文本层；扫描件不做页面 OCR。
- 日期精度只允许 `YYYY-MM`、`YYYY-MM-DD`、`present`；未填结束日不等于「至今」。
- 列表默认只给元数据。任务需要正文时才读取详情；历史版本只返回版本元数据。

### 求职仓库

- **岗位**：粘贴 JD 原文或抓取公开岗位链接，提取结构后经审批入库；可搜索、查看详情，并基于 JD 与完整经历库生成可解释的结构化匹配分析。
- **简历资产**：本机当前内容、本地草稿、重命名、归档 / 恢复、本地检查点回退。
- **原始投递文件**：用户原样保存在本机的 PDF/DOCX，不进入写作、匹配或复用链路；可指定用于任意岗位的网页上传。

### 简历生成与导出

一个自然语言 Agent 即可生成，不并行引入第二套规则模型。

- 支持通用简历（不绑定 JD）、针对目标岗位的 tailored 简历，以及用户坚持不匹配岗位并指定经历的 `user_directed` 路径。
- 生成结果不得编造。量化结论必须能追溯到可复查来源。不满足质量标准时会标明原因，不会冒充可直接交付。
- 一次一页可渲染；A4 预览、保存到简历库和导出 PDF 使用同一内部修订。
- 本地草稿自动保存；侧栏可打开进行中的本地简历。

### 投递追踪

- 看板、时间轴、日历三种视图；Application 同时引用实际 JD 与 Resume，并冻结标题快照和 `resumeContentHashSnapshot`。
- 合法状态迁移需二次确认。终态不可继续推进。
- Interview、Note、Reminder 归属 Application；提醒由本机调度通知。
- 可从求职仓库的岗位或简历发起投递记录。

### 材料库

- 本机材料目录，支持 PDF、DOCX、TXT、MD、PNG、JPG。
- 图片可走本机 OCR。材料默认只保存在本机，不自动成为云端固定资产。

### Agent 任务与内置浏览器

- 独立 Browser Shell：多标签、导航、下载、Agent 可见层；登录、OTP、CAPTCHA、法律与敏感问题必须用户接管。
- 托管任务仅在 App 打开时运行，可暂停、恢复、接管、检查点和授权范围约束。
- Job Scout 可按授权来源搜索、去重、匹配并进入 Shortlist（当前机制覆盖 Greenhouse / Lever）。
- 招聘站点与搜岗来源的正式/候选边界见 [`local-docs/site-support-boundary.md`](local-docs/site-support-boundary.md)（Greenhouse/Lever 为搜岗来源；BOSS/JobsDB/LinkedIn 为 candidate，非稳定全自动投递）。
- 招聘表单填写、Answer Vault、提交回执与 Application Proposal 均走审批；真实站点提交仍按站点逐域验收，不能称为完全托管可用。
- Inbox Signals 可连接浏览器 Webmail，或可选接入邮件增量，把信号关联到投递并生成状态 / 面试提案。
- 可授权周期性循环：按简历搜岗、按邮件跟进或面试 briefing。长周期真实运行仍以实测为准。

### 账户、隐私与本机数据

- 设置中可维护个人档案、AI 接口、求职偏好、邮箱连接、日程、自动化与隐私。
- 可查看隐私政策、**导出本机数据**、**清除本机数据**。没有 Coolto 账号，也没有云端删除；文案不宣称「云端仍保留」。
- macOS 可在用户确认后把面试写入系统日历；真实机器的权限与打包验收仍按发布清单执行。
- 业务写入仍经不可变 Proposal、宿主审批、LocalSyncStore / Outbox 和乐观锁，全部留在本机。

## 产品原则

- 本机是经历、JD、简历当前内容和投递事实的唯一来源。`draft / pending / checkpoint / files / chat / proposal` 同样只在本地。
- 领域工具只能准备 Proposal；真正写入的执行器不出现在模型 Tool List 中。审批是宿主控制通道，不是模型可以伪造的聊天文本。
- Renderer 不得读取或持久化绝对路径；敏感凭证不经过渲染层。
- 外部内容（JD、简历、聊天、网页）只作输入，不得覆盖系统约束或安全规则。
- 被 Agent 读取的工具结果会进入当前模型上下文。产品允许模型处理完成任务所需的固定资产，但不允许 Agent 自动写入、删除或对外提交。

## 桌面开发与跨平台安装（PRD §5 必达）

需要 Node.js **22.13** 或更高版本。以下步骤在 **Windows / macOS / Linux** 从源码均可完成：安装依赖 → 开发启动 → 配置自备 API → 跑通主路径。

```bash
cp .env.example .env
npm install
npm run desktop:dev
```

`.env` 可选用 `LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL` 做首次启动引导。之后请在 **设置 → AI 接口** 保存；Key 进系统凭据库，不要把真实密钥提交进仓库。也兼容 `OPENAI_BASE_URL` / `OPENAI_API_KEY` / `DEEPSEEK_API_KEY`。

配置 API 后，至少可完成开源 PRD §1（fixture/`qa:browser-agent`）或 §2（对话生成简历）之一条主路径。自测清单见 [`local-docs/oss-self-test-checklist.md`](local-docs/oss-self-test-checklist.md)。

这个 Desktop 不会连接 Coolto 生产 API 或 Credit 网关。

### 构建与打包（可选发布物）

```bash
npm run desktop:build
```

Windows / macOS 安装包在全量校验后按 `local-docs/desktop-release-hardening-runbook.md` 执行（签名/公证为 **maintainer 可选**，非开源必达）：

```bash
npm run check
npm run package:win
npm run package:mac:dmg
```

Linux 以源码 + `desktop:dev` / `desktop:build` 为主；可选 `npm run package:linux`（AppImage，box 冒烟）。Win/Mac 真机安装包见 `package:win` / `package:mac*`，开源 P0 标为 **deferred**（需对应 OS；Linux box 仅能冒烟到 wine/darwin 硬阻断，见 `local-docs/self-test-evidence/section-5-win-mac-package/`）。

### GitHub Actions（商业发布 workflow）

仓库内 `win-release` / `mac-release` / `homepage-deploy` 仅保留 **手动 `workflow_dispatch`**，开源 fork **不必**配置 `RELEASE_SERVER_*`。未配置时上传/部署步骤会跳过，不会在 clone 后因缺 secrets 自动变红。维护者若要做商业安装包上传，再自行配置 secrets 并手动 Run。详见 [`local-docs/oss-publish-checklist.md`](local-docs/oss-publish-checklist.md)。

### 更新说明（开源必达）

**开源版请自行管理版本**：从 git 拉取或替换本地源码/发布物后重新 `npm install` 与构建/启动即可。仓库内虽有 `electron-updater` 与 `dev-app-update.yml` 供商业/维护者可选实验，**不作为开源必达自动更新基础设施**。更新失败或中断时，本机业务数据目录（Electron `userData`）与源码树分离，应保持可恢复；若你使用实验性自动更新，请自行验证后再升级。

### 平台能力降级

| 能力 | 拒绝/不可用时行为 |
|------|-------------------|
| 系统通知 | `Notification.isSupported()` 为 false 时提醒调度直接跳过，不伪造成功投递 |
| 系统日历（macOS 等） | 权限 `denied` / `not_determined` 时返回 `permission_required` 与可读文案，不假装已写入 |
| Linux 无 keyring | 未打包 `desktop:dev` 自动 plaintext safeStorage；正式包 box/CI 冒烟可设 `COOLTO_ALLOW_PLAINTEXT_SAFE_STORAGE=1`（见主进程 bootstrap）；生产仍应使用系统凭据库 |

本机诊断与日志说明见 [`local-docs/local-diagnostics.md`](local-docs/local-diagnostics.md)；隐私与本机数据导出/清除见 **设置 → 隐私与数据**。

## 开发 CLI

CLI 仍可作为无界面宿主调试 Agent 循环，不是产品主入口。

```bash
npm run dev
npm run dev -- "请介绍一下你当前的运行架构"
npm run logout
```

本地文件通过显式 `--attach` 选择。交互模式用 `Ctrl+D` 退出，`Ctrl+C` 取消当前生成。CLI 需要你在环境里提供 OpenAI 兼容的接口配置。

## 验证

开源自测（无 Key / 有 Key 清单与 GUI 步骤）见 [`local-docs/oss-self-test-checklist.md`](local-docs/oss-self-test-checklist.md)；GUI 点通见 [`local-docs/oss-gui-self-test.md`](local-docs/oss-gui-self-test.md)。

```bash
npm run check
```

依次执行：简历模板一致性、`src/` 业务源文件行数门禁、Node 类型检查、Vue 类型检查、`node --test` 单测、Node 构建、桌面构建。变更 UI 或可见行为还需真实 Electron 人工验收。

无 Key 的托管 fixture QA（Browser Shell + managed apply，不要求 `LLM_API_KEY`）：

```bash
npm run qa:browser-agent
```

开发约定见 `AGENTS.md`；贡献与安全审核见 [`CONTRIBUTING.md`](CONTRIBUTING.md)。

欢迎大学生与第一次参与开源的同学：请 **Fork 本仓后开 PR** 合入 `main`（优先 squash merge），**不要**申请 Collaborator / 写权限。流程、新手范围与安全自检见 CONTRIBUTING；可认领的公开新手任务见 [Issues](https://github.com/JsChen766/coolto-desktop/issues)（含 good first issue）。本地草稿见 [`local-docs/beginner-issues.md`](local-docs/beginner-issues.md) 与 [`local-docs/beginner-issues-ready-to-post.md`](local-docs/beginner-issues-ready-to-post.md)。

当前产品路线入口是 `local-docs/p0-product-completion-roadmap/README.md`；开源裁剪 PRD 见 `local-docs/PRD-open-source-desktop.md`。

## 代码入口

- `src/agent/`：创建 Pi Agent、system prompt、以及 OpenAI 兼容模型配置。
- `src/tools/`：模型可见的唯一工具入口；`registry.ts` 按宿主能力装配。
- `src/approvals/`：通用审批生命周期、不可变 Payload 和执行器注册。
- `src/desktop/main/`：Electron 主进程、IPC、同步、浏览器、隐私与打包边界。
- `src/desktop/preload/`：渲染进程可调用的受控 API。
- `src/desktop/renderer/`：Vue 3 界面（对话、仓库、追踪、材料、任务、Browser Shell）。
- `src/resume/`：简历工作区、一页编译、质量门与导出。
- `src/experience/`、`src/tracker/`、`src/material/`、`src/browser/`、`src/agent-task/`、`src/inbox-signals/`、`src/privacy/`：对应领域逻辑。
- `src/cli/`：开发 CLI 与专项 QA 入口。
- `src/api/`、`src/auth/`：后端会话与系统凭据存储。
