# Coolto Local Agent

Coolto 桌面端的本地单 Agent 内核。当前版本以 CLI 作为最小宿主，使用
TypeScript、Pi Agent Core 和 DeepSeek。

## 当前能力

- 只有一个 Agent，不使用 Router、LangGraph 或业务节点。
- 唯一业务输入是自然语言。
- 模型根据工具描述自行判断是否调用工具。
- 不确定且会影响结果时，由 System Prompt 要求 Agent 先追问。
- 启动 Agent 前通过现有后端登录，Session Token 保存在系统安全凭据库。
- 已接入 `get_current_user`，可读取当前登录用户。
- 已接入 `search_experiences` 和 `get_experience`，可搜索经历并读取当前详情。
- 可从自然语言、粘贴文本或用户明确选择的本地文件导入经历。
- 写入先生成不可变预览，再由宿主显示“接受、拒绝、自定义回答”待决策卡片。
- 对外暴露与 Electron 无关的事件接口。
- 包含一个只读诊断工具，用于验证完整 tool-call 循环。

JD、简历和投递记录尚未接入；它们属于下一阶段的业务工具。

## 桌面 APP

项目已经包含 Electron + Vue 桌面宿主，视觉风格参考本机
`excel-agent` 的暖灰文档式聊天界面。

当前桌面端包含：

- 邮箱密码登录与 Electron `safeStorage` 登录状态恢复。
- 左侧新建对话、对话历史、切换、重命名和删除。
- 按登录用户隔离的本地加密对话文件。
- Pi Agent 消息状态导出与恢复。
- 流式 Assistant 输出。
- 经过 DOMPurify 清理的 Markdown 富文本。
- 可折叠工具调用状态。
- 接受、拒绝和自定义回答审批卡片。
- 深色模式。
- 可开关的简历 Artifact 预览区域。
- 全部 UI 图标使用 Lucide 官方 `@lucide/vue` 组件。

开发运行：

```bash
npm run desktop:dev
```

构建桌面进程、preload 和 renderer：

```bash
npm run desktop:build
```

本地对话不会上传 Web。对话内容由 Electron `safeStorage` 加密后保存在应用
`userData` 目录，并按登录用户 ID 隔离。待决策操作仍然只在当前进程内有效，
重启后不会自动执行。

经历列表只返回元数据。只有任务需要正文时 Agent 才读取具体经历，且历史版本
只返回版本元数据，不把所有历史正文交给模型。需要注意：当前 LLM 使用 DeepSeek
API，因此被 Agent 读取的工具结果会作为当前推理上下文发送给配置的模型服务。
产品当前允许 DeepSeek 处理完成任务所需的固定资产，不进行逐次读取确认；这不代表
允许 Agent 自动写入、删除或对外提交。工具结果不会成为 Web 端聊天记录，也不会
在本地建立固定资产缓存。

## 当前生成能力

Agent 可以在读取经历后直接生成自我介绍、经历总结、能力概述和 Cover Letter
正文，不需要为每种文本建立单独 Agent 或生成节点。

- 用户要求基于全部经历时，Agent 必须翻完经历分页并读取每条详情。
- 自我介绍可以直接基于全部经历生成。
- Cover Letter 还需要目标公司、岗位或 JD；当前可由用户在自然语言输入中提供。
- 当前只在对话中输出生成结果，尚不能保存为云端 artifact、导出文件或创建邮件草稿。

## 经历导入

自然语言和粘贴文本直接在交互模式中输入即可，例如：

```text
请导入这段经历：2025 年 1 月到 3 月，我负责……
```

本地文件通过显式的 `--attach` 参数选择。支持 PDF、DOCX、TXT、MD，每个文件
最大 10 MB：

```bash
npm run dev -- --attach "/绝对路径/resume.pdf"
```

启动后再输入“请从附件导入经历”。多个附件可以重复使用 `--attach`：

```bash
npm run dev -- --attach "/路径/a.docx" --attach "/路径/b.md"
```

完整流程是：

1. Agent 读取用户文本或已选择附件。
2. Agent 提取结构化候选，后端尚未发生写入。
3. 本地规则校验字段，并与云端经历元数据做精确去重；重复项默认不选中。
4. 宿主展示包含完整候选的待决策卡片。
5. 选择“接受”后，宿主执行预览时冻结的 Payload。
6. 选择“拒绝”不会写入；选择“自定义回答”会让 Agent 按反馈生成新预览。

导入 Proposal 只存在于当前进程内，不会作为固定资产缓存写入本地。原始附件也
不会上传后端；只有用户确认后的结构化经历通过现有业务 API 写入云端。PDF 首版
只支持含文本层的文件，扫描件暂不做 OCR。

当前后端没有批量事务接口，因此多条经历会逐条写入。部分失败时，已成功项不会
重复保存，失败项会保留在当前 Proposal 中，并产生新的待决策卡片供用户重试。

## 通用写入审批

审批属于宿主控制通道，不是模型可以伪造的聊天文本。领域工具只能准备 Proposal；
实际写入执行器不会出现在模型 Tool List 中。

当前 CLI 对写入操作提供：

```text
[1] 接受并执行
[2] 拒绝
[3] 自定义回答
```

- 接受：一次性执行卡片所展示的不可变 Payload。
- 拒绝：清除 Proposal，不执行任何写入。
- 自定义回答：撤销旧 Proposal，把反馈作为自然语言交回同一个 Agent。

`ApprovalManager`、执行器注册表和事件协议是通用的，后续 JD、简历、投递记录、
邮件草稿及浏览器填写计划可以复用；每个领域仍保留独立的 prepare 工具、Schema
和 Action Executor，避免形成通用上帝工具。

## 本地运行

需要 Node.js 22 或更高版本。

```bash
cp .env.example .env
```

在 `.env` 中填写本地开发用的 `DEEPSEEK_API_KEY`，然后运行：

```bash
npm install
npm run dev
```

首次运行时，CLI 会提示输入 Coolto 邮箱和密码。密码输入不回显，也不会保存。
登录后只把 Session Token 保存到操作系统安全凭据库：

- macOS：Keychain
- Windows：Credential Vault
- Linux：Secret Service

后续启动会先使用已保存 Session 调用 `/users/me` 验证。Session 有效时自动登录；
过期或被撤销时清除旧 Session，再提示输入邮箱和密码。

也可以直接执行一轮自然语言输入：

```bash
npm run dev -- "请介绍一下你当前的运行架构"
```

单轮模式同样会自动恢复已有登录状态。

非交互集成测试可以为单次进程同时提供 `COOLTO_EMAIL` 和
`COOLTO_PASSWORD`，但不要把密码写入 `.env`、脚本或版本库。

交互模式使用 `Ctrl+D` 退出；运行中使用 `Ctrl+C` 取消当前生成。
普通退出不会注销账号。如需主动退出并清除系统安全凭据：

```bash
npm run logout
```

## 验证

```bash
npm run check
```

该命令依次执行严格类型检查、离线 Agent 工具循环测试和生产构建。

## 代码入口

- `src/agent/create-agent.ts`：创建 Pi Agent 和模型。
- `src/agent/system-prompt.ts`：单 Agent 行为与追问规则。
- `src/api/coolto-api-client.ts`：后端登录和 Cookie 会话。
- `src/auth/keychain-session-store.ts`：系统安全凭据存储。
- `src/auth/session-manager.ts`：自动恢复、验证和失效重登。
- `src/tools/search-experiences.ts`：经历列表与条件搜索。
- `src/tools/get-experience.ts`：按 ID 读取当前经历详情。
- `src/files/selected-file-registry.ts`：隔离并限制用户明确选择的附件。
- `src/import/proposal-store.ts`：保存当前进程内的待确认导入 Proposal。
- `src/approvals/`：通用审批生命周期、不可变 Payload 和执行器注册。
- `src/actions/experience-import-executor.ts`：宿主内部经历导入执行器。
- `src/tools/import-experiences/`：模型可用的经历导入预览工具。
- `src/cli/approval-ui.ts`：CLI 待决策卡片和三种决策输入。
- `src/tools/registry.ts`：模型能看到的唯一工具入口。
- `src/agent/events.ts`：CLI/Electron 共用的事件映射。
- `src/cli/main.ts`：仅接收自然语言的 CLI 宿主。
