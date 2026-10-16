# Beginner-friendly issue 草稿

本文件为开源贡献就绪（见 `PRD-open-source-desktop.md` §13）准备的 **新手友好 Issue 草稿**。仓库暂未绑定公开 GitHub 时，先在此维护；日后可粘贴到 Issue Tracker 或 `.github/ISSUE_TEMPLATE`。

**全局约束（每条 Issue 均适用）**

- **不碰密钥**：不读取、不提交、不粘贴真实 `.env` / API Key / token / cookie；示例只用占位符。
- **不改 verified 站点宣称**：不得把 Greenhouse/Lever 写成已验收投递站点，不得把 BOSS / JobsDB / LinkedIn 写成 `verified` 或「稳定全自动投递」。叙述须符合 `local-docs/site-support-boundary.md`。
- **优先文档与排错**：下列选题以文档、FAQ、检查清单为主；不要求改业务逻辑。若顺手改文案，须保持与策略源码一致。

---

## Issue 1 — README：补充桌面启动故障排查

### 标题

`docs: add desktop:dev startup troubleshooting to README`

### 背景 / 为何适合新手

新贡献者按 README 跑 `npm run desktop:dev` 时，常见卡在 Node 版本、依赖安装或 Electron 窗口起不来，而当前 README「桌面开发」一节几乎只有成功路径命令，缺少「失败时看哪里」。这是纯文档增量，不碰内核与站点策略。

### 验收步骤

- [ ] 在 README「桌面开发」附近新增简短「启动故障排查」小节（或表格）。
- [ ] 至少覆盖 3 类问题，并给出可执行的下一步（命令或检查项），例如：
  - Node 版本低于 22.13（提示 `node -v` 与升级）。
  - `npm install` / native 依赖失败（提示清缓存重装、看终端完整报错；勿粘贴含 Key 的环境输出）。
  - `desktop:dev` 无窗口或闪退（提示先跑 `npm run desktop:typecheck`、确认未改坏 preload/main 入口；日志中勿打印 `LLM_API_KEY`）。
- [ ] 文中明确：真实 Key 只放本机 `.env` 或「设置 → AI 接口」，**不要**写进 Issue 评论、截图或日志粘贴。
- [ ] **不**新增或暗示任何已 verified 投递站点；站点相关一句可链到 `local-docs/site-support-boundary.md`。
- [ ] `git diff` 仅文档（或极少量交叉链接）；无需改 `src/` 业务代码。

### 相关文件路径提示

- `README.md`（主改）
- `CONTRIBUTING.md`（可交叉链接「本地开发」）
- `.env.example`（仅作占位符说明，勿提交真实值）
- `package.json`（核对脚本名：`desktop:dev`、`desktop:typecheck`、`check`）

### 明确不碰

密钥与凭据；`recruiting-site-policy.ts` 的 `status` / `verifiedAt`；任何把候选站点写成正式投递的文案。

---

## Issue 2 — 站点边界文档：补「搜岗 vs 投递」示意图说明

### 标题

`docs: add Job Scout vs candidate-site caption notes to site-support-boundary`

### 背景 / 为何适合新手

`local-docs/site-support-boundary.md` 已用表格区分 Greenhouse/Lever（搜岗来源）与 BOSS/JobsDB/LinkedIn（`candidate`）。但对第一次读文档的人，仍容易把「能搜岗」误读成「能自动投递」。补一段**图示说明或截图占位 + 图注**（可用 ASCII/Mermaid，或「此处可附截图」+ 必写图注），帮助对齐真实边界，且不需要实现新站点。

### 验收步骤

- [ ] 在 `site-support-boundary.md` 增加一小节（例如「如何读这张边界」），用图示或编号步骤说明：搜岗来源 → Shortlist → 候选站点上仅 `read` / `match` / `takeover_required`。
- [ ] 若使用截图占位，每张图必须有图注，且图注含：**不是 verified 投递**、**禁止宣传稳定全自动投递**。
- [ ] 正文继续与 `src/browser/recruiting-site-policy.ts` 一致；**不**修改策略源码的 `status` / `verifiedAt`。
- [ ] README 或 CONTRIBUTING 若提及站点，链接仍指向该文档，措辞不升级宣称。
- [ ] 自检：全文搜索本改动，确认未出现「已正式支持投递」「verified 投递站点」等用于 Greenhouse/Lever/BOSS/JobsDB/LinkedIn 的错误表述。

### 相关文件路径提示

- `local-docs/site-support-boundary.md`（主改）
- `src/browser/recruiting-site-policy.ts`（只读对照，不改）
- `README.md`（可选：加一句「见图示说明」链接）

### 明确不碰

密钥；把任一站点标为 `verified`；虚构「已验收一键投递」任务或截图结论。

---

## Issue 3 — CONTRIBUTING：依赖 / 脚本改动检查清单

### 标题

`docs: add dependency-and-scripts change checklist to CONTRIBUTING`

### 背景 / 为何适合新手

CONTRIBUTING「安全审核」已要求依赖与 `scripts/` 改动须在 PR 说明动机，但缺少可勾选清单，新手容易漏写「来源可信度 / 是否新增安装钩子」。把约定收成检查清单，降低安全评审成本，仍是文档向贡献。

### 验收步骤

- [ ] 在 `CONTRIBUTING.md`「安全审核」或「提交与 PR」下增加可勾选清单，至少含：
  - [ ] 是否改动 `package.json` / lockfile；若是，说明动机与选用该包的原因。
  - [ ] 是否改动 `scripts/`、npm lifecycle hooks、下载/打包逻辑；若是，说明触发时机与风险。
  - [ ] 确认未把 API Key、token、私钥写入仓库、测试夹具或**日志/错误信息**。
  - [ ] 站点相关文案已对照 `local-docs/site-support-boundary.md`。
- [ ] 清单措辞与现有「禁止提交密钥」条款不冲突、不重复到冗长；可交叉引用本节。
- [ ] 示例 PR 说明中使用假数据（如 `sk-***` 占位），无真实密钥。

### 相关文件路径提示

- `CONTRIBUTING.md`（主改）
- `package.json`、`scripts/`（只读，举例时引用路径）
- `local-docs/site-support-boundary.md`（清单中链接）

### 明确不碰

实际升级依赖或改脚本（本 Issue 只加文档清单）；密钥；verified 站点宣称。

---

## Issue 4 — 校验失败排错：`typecheck` / `test` 提示

### 标题

`docs: document typecheck and test failure triage tips`

### 背景 / 为何适合新手

`npm run check` 串联模板一致性、行数门禁、`typecheck`、`desktop:typecheck`、`test`、构建等多步。失败时新手常从头重跑整条 `check`，不清楚该单独复现哪一步。补一小节「失败时如何缩小范围」，对齐 `AGENTS.md` / `package.json` 已有脚本名即可。

### 验收步骤

- [ ] 在 `CONTRIBUTING.md` 或 README「验证」附近增加「校验失败时」小节。
- [ ] 写明可单独复现的命令，至少包括：
  - `npm run typecheck`
  - `npm run desktop:typecheck`
  - `npm run test`
  - （可选）`npm run check:source-lines` / `npm run check:resume-template`
- [ ] 提示：先根据失败步骤看对应 `tsconfig` / `test/**/*.test.ts`；贴日志时**打码**环境变量与 Key。
- [ ] 说明变更 UI 时，`check` 绿仍需 Electron 人工验收（与现有 README 一致）。
- [ ] 不引入新的 CI 配置或业务代码；纯文档。

### 相关文件路径提示

- `CONTRIBUTING.md` 或 `README.md`（主改其一，另一处可链过去）
- `package.json`（脚本名核对）
- `AGENTS.md`（开发约定对照）
- `tsconfig.json`、`tsconfig.web.json`、`tsconfig.preload.json`（排错指向）
- `test/`（单测目录提示）

### 明确不碰

密钥写入日志的「示范」不得含真值；不修改门禁阈值或测试以「绕过」失败；不涉及站点 verified 宣称。

---

## Issue 5 — FAQ：Job Scout 搜岗 vs 投递站点

### 标题

`docs: add FAQ — Job Scout sources vs application site status`

### 背景 / 为何适合新手

README 已有一句边界说明，但贡献者写 Issue/PR 时仍常混用「支持 Greenhouse」与「支持自动投递」。用 4～6 条 FAQ 固化正确说法，比改代码更能减少错误对外表述；适合只改文档的首次贡献。

### 验收步骤

- [ ] 在 `local-docs/site-support-boundary.md` 末尾（或独立 `local-docs/faq-job-scout-vs-sites.md` 并在 README 链接）增加 FAQ。
- [ ] 至少回答：
  1. Greenhouse/Lever 在产品里是什么角色？（Job Scout API 搜岗，不是 verified 投递）
  2. BOSS/JobsDB/LinkedIn 当前状态？（`candidate`，`verifiedAt: null`）
  3. 候选站点允许宣传哪些能力？（`read` / `match` / `takeover_required`）
  4. 登录/OTP/CAPTCHA 谁处理？（用户接管）
- [ ] 每条答案可链到 `site-support-boundary.md` 对应小节或策略文件路径。
- [ ] README「当前能力」或「验证」附近增加一行指向该 FAQ。
- [ ] 自检：FAQ **没有**把任何站点写成稳定全自动投递。

### 相关文件路径提示

- `local-docs/site-support-boundary.md`（或新建 `local-docs/faq-job-scout-vs-sites.md`）
- `README.md`（链接）
- `src/browser/recruiting-site-policy.ts`（只读对照）

### 明确不碰

密钥；更改 `verifiedAt` 或站点 `status`；开新「verified 投递站点」实现任务。

---

## 维护说明

- 关闭或迁移到公开 Issue 后，在本文件对应条目顶部标注 `Moved to #N` 或 `Done`，避免重复开题。
- 新草稿须继续遵守文首「全局约束」。
