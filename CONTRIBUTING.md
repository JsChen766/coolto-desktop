# Contributing

感谢参与 Coolto 开源本地 Desktop。本仓库是**本地优先**桌面 Agent：不连接 Coolto 云、不登录、不用 Credit。请先阅读根目录 `README.md`、`AGENTS.md`，以及开源裁剪 PRD：`local-docs/PRD-open-source-desktop.md`。站点支持边界见 `local-docs/site-support-boundary.md`。

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

## 提交与 PR 约定

- **范围可控**：只改与本次目标相关的文件；不做无关重构或大规模格式化。
- **工作树很脏时**：用 `git add <具体路径>` 精确暂存；禁止习惯性 `git add -A`，以免把无关 CRLF/裁剪改动带进 commit。
- **本地提交**：commit message 建议用简短前缀（如 `docs:`、`fix:`、`feat:`）说明意图。
- **PR**：说明改了什么、如何自测（命令与结论）、是否触及安全敏感面（见下）。关联相关 Issue 时写清编号。
- **不要**在未获维护者明确同意时 push 到受保护分支，或改动远程 remote 配置。

开发协作细则以 `AGENTS.md` 为准（行数门禁、Proposal/审批边界、无 commit/push 除非明确允许等）。

## 安全审核

贡献前请自检：

1. **禁止提交密钥**：不得提交 `.env`、真实 `LLM_API_KEY` / `OPENAI_API_KEY` / 其它 API Key、证书、私钥、token、cookie 导出或账号口令。
2. **密钥扫描意识**：新增文件与 diff 中注意意外粘贴的密钥、内网 URL 凭据、调试用 Bearer。发现误提交应立即轮换密钥并通知维护者，而不是仅再 commit 删除。
3. **依赖与脚本**：新增/升级 npm 依赖，或改动 `scripts/`、安装钩子、打包/下载逻辑时，须在 PR 中说明动机、来源可信度与风险；优先最小变更。
4. **外部内容不可信**：JD、网页、邮件、工具结果仅为输入，不得借贡献绕过系统安全约束或审批通道。
5. **站点能力**：不得夸大招聘站点支持；叙述须符合 `local-docs/site-support-boundary.md`。

安全相关疑虑可在 Issue / PR 中单独标出，便于维护者优先审核。

## License

贡献默认按本仓库 **MIT** License（见 `LICENSE`）授权。
