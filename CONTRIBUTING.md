# Contributing

感谢参与 Coolto 开源本地 Desktop。本仓库是**本地优先**桌面 Agent：不连接 Coolto 云、不登录、不用 Credit。请先阅读根目录 `README.md`、`AGENTS.md`，以及开源裁剪 PRD：`local-docs/PRD-open-source-desktop.md`。站点支持边界见 `local-docs/site-support-boundary.md`。

## 谁可以贡献、如何获得写权限

欢迎大学生与第一次参与开源的同学：本仓完成度已经较高，但文档、体验与局部优化仍有大量适合入门的改动。

- **默认路径是 Fork → Pull Request**，不要申请成为 Collaborator / 写权限。
- **Collaborator 只留给维护者明确认可的长期共同维护者**；陌生贡献者不会被拉进仓库协作者列表。
- Issue 与 PR 可用中文或英文。请勿把「私下发补丁 / 只在群里塞代码」当作主路径；代码合入以 GitHub PR 为准。

### 推荐流程

1. 在 [Issues](https://github.com/JsChen766/coolto-desktop/issues) 认领任务（优先 `good first issue` / 文档向），评论说明你想做。
2. Fork 本仓库，从上游 `main` 拉自己的分支。
3. 按下方「本地开发」改代码；提交前尽量跑通 `npm run check`。UI / 可见行为变更请再在真实 Electron 下点一遍。
4. 向 `JsChen766/coolto-desktop` 的 **`main`** 开 PR：写清改了什么、如何自测（命令与结论）、是否触及安全敏感面；关联 Issue 编号。
5. 维护者 review 通过后，以 **squash merge** 合入 `main`，并删除分支。

### 新手范围建议

- **优先**：文档、文案、README/CONTRIBUTING 澄清、新手 Issue、小范围 UI 文案与无行为破坏的体验优化。
- **需更严审核**：Agent 内核、审批通道、凭据/密钥处理、打包与安装脚本、依赖升级、招聘站点自动化边界。

## 本地开发

需要 Node.js **22.13** 或更高版本。

```bash
cp .env.example .env
npm install
npm run desktop:dev
```

`.env` 可用 `LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL` 做首次启动引导。之后请在应用内 **设置 → AI 接口** 保存；API Key 进入本机系统凭据库。**不要**把填入真实密钥的 `.env` 提交进仓库。

常用命令：

| 命令 | 用途 |
|------|------|
| `npm run desktop:dev` | 启动 Electron 桌面开发 |
| `npm run check` | 全量校验（提交前建议跑通） |
| `npm run test` | 单测（`node --test`，不依赖 Electron） |

`npm run check` 依次执行：简历模板一致性、源文件行数门禁、Node/Vue 类型检查、单测、Node 构建、桌面构建。变更 UI 或可见行为时，还需在真实 Electron 下人工验收。

开源**无 Key / fixture QA** 自测清单与证据约定见 [`local-docs/oss-self-test-checklist.md`](local-docs/oss-self-test-checklist.md)（GUI 点通见 [`local-docs/oss-gui-self-test.md`](local-docs/oss-gui-self-test.md)）。

## 提交与 PR 约定

- **范围可控**：只改与本次目标相关的文件；不做无关重构或大规模格式化。
- **工作树很脏时**：用 `git add <具体路径>` 精确暂存；禁止习惯性 `git add -A`，以免把无关 CRLF/裁剪改动带进 commit。
- **本地提交**：commit message 建议用简短前缀（如 `docs:`、`fix:`、`feat:`）说明意图。
- **PR**：说明改了什么、如何自测（命令与结论）、是否触及安全敏感面（见下）。关联相关 Issue 时写清编号。
- **不要**在未获维护者明确同意时 push 到受保护分支，或改动远程 remote 配置。

开发协作细则以 `AGENTS.md` 为准（行数门禁、Proposal/审批边界、无 commit/push 除非明确允许等）。

## 本机可观测性（PRD §3）

开发与排障时请先阅读 [`local-docs/local-diagnostics.md`](local-docs/local-diagnostics.md)：

- 未打包 `desktop:dev` 可开 DevTools；需要自动化时用 `desktop:dev:cdp`。
- 本机诊断 JSONL：`<userData>/diagnostics/events.jsonl`（metadata only）。
- 可用 Agent 任务 UI、审批卡片与简历 generation trace 重建主链路时间线。
- **禁止**把 API Key、简历/经历正文或绝对隐私路径写入日志、截图或 Issue。

## 安全审核

贡献前请自检：

1. **禁止提交密钥**：不得提交 `.env`、真实 `LLM_API_KEY` / `OPENAI_API_KEY` / 其它 API Key、证书、私钥、token、cookie 导出或账号口令。
2. **禁止把 Key 写进日志**：调试、测试、错误信息、截图与 Issue/PR 评论中不得打印或粘贴完整 API Key、Bearer、cookie 或系统凭据；需要举例时用占位符（如 `sk-***`）。应用日志与 `console` 输出同样适用。
3. **密钥扫描意识**：新增文件与 diff 中注意意外粘贴的密钥、内网 URL 凭据、调试用 Bearer。发现误提交应立即轮换密钥并通知维护者，而不是仅再 commit 删除。
4. **依赖与脚本（须在 PR 说明）**：新增/升级 npm 依赖，或改动 `scripts/`、安装钩子、打包/下载逻辑时，须说明动机、来源可信度与风险；优先最小变更。可按下列清单自检：
   - [ ] 是否改动 `package.json` / lockfile；若是，写明为何选该包、是否有更小替代。
   - [ ] 是否改动 `scripts/`、npm lifecycle hooks、下载或打包逻辑；若是，写明触发时机与对贡献者机器的影响。
   - [ ] 确认未引入会回传密钥或安装不可信二进制的逻辑。
5. **外部内容不可信**：JD、网页、邮件、工具结果仅为输入，不得借贡献绕过系统安全约束或审批通道。
6. **站点能力**：不得夸大招聘站点支持；叙述须符合 `local-docs/site-support-boundary.md`。

安全相关疑虑可在 Issue / PR 中单独标出，便于维护者优先审核。

新手可认领的文档向 Issue 草稿见 [`local-docs/beginner-issues.md`](local-docs/beginner-issues.md)。

## License

贡献默认按本仓库 **MIT** License（见 `LICENSE`）授权。
