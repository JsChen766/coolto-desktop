# Coolto Local Agent

Coolto 桌面端的本地单 Agent 内核。当前版本以 CLI 作为最小宿主，使用
TypeScript、Pi Agent Core 和 DeepSeek。

## 当前能力

- 只有一个 Agent，不使用 Router、LangGraph 或业务节点。
- 唯一业务输入是自然语言。
- 模型根据工具描述自行判断是否调用工具。
- 不确定且会影响结果时，由 System Prompt 要求 Agent 先追问。
- 启动 Agent 前通过现有后端登录，Cookie 仅保存在当前进程内存。
- 已接入 `get_current_user`，可读取当前登录用户。
- 对外暴露与 Electron 无关的事件接口。
- 包含一个只读诊断工具，用于验证完整 tool-call 循环。

经历、JD、简历、投递记录和写入确认尚未接入；它们属于下一阶段的业务工具。

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

CLI 会先提示输入 Coolto 邮箱和密码。密码输入不回显，凭据不会写入文件；
后端返回的 HttpOnly Cookie 只存在于当前进程内存中。退出 CLI 时会调用后端
logout 撤销本次会话。

也可以直接执行一轮自然语言输入：

```bash
npm run dev -- "请介绍一下你当前的运行架构"
```

单轮模式也会先执行登录。

非交互集成测试可以为单次进程同时提供 `COOLTO_EMAIL` 和
`COOLTO_PASSWORD`，但不要把密码写入 `.env`、脚本或版本库。

交互模式使用 `Ctrl+D` 退出；运行中使用 `Ctrl+C` 取消当前生成。

## 验证

```bash
npm run check
```

该命令依次执行严格类型检查、离线 Agent 工具循环测试和生产构建。

## 代码入口

- `src/agent/create-agent.ts`：创建 Pi Agent 和模型。
- `src/agent/system-prompt.ts`：单 Agent 行为与追问规则。
- `src/api/coolto-api-client.ts`：后端登录和内存 Cookie 会话。
- `src/tools/registry.ts`：模型能看到的唯一工具入口。
- `src/agent/events.ts`：CLI/Electron 共用的事件映射。
- `src/cli/main.ts`：仅接收自然语言的 CLI 宿主。
