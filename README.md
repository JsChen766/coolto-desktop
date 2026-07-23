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
- 对外暴露与 Electron 无关的事件接口。
- 包含一个只读诊断工具，用于验证完整 tool-call 循环。

JD、简历、投递记录和写入确认尚未接入；它们属于下一阶段的业务工具。

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
- `src/tools/registry.ts`：模型能看到的唯一工具入口。
- `src/agent/events.ts`：CLI/Electron 共用的事件映射。
- `src/cli/main.ts`：仅接收自然语言的 CLI 宿主。
