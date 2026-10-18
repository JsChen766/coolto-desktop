# Coolto 开源发布清单（本地可交付）

日期：2026-10-18（Asia/Shanghai）  
仓：`/workspace/coolto-desktop-local`  
本清单提交前基线 HEAD：`ad7d2b1`（`docs(oss): add P1 phase summary`）  
约束：**不 push、不开 PR**；真实 Key 不写入任何文件或本清单。

---

## 已勾项（本机已完成）

### README / 产品宣称

- [x] 主路径清晰：对话 Agent、经历 / JD / 简历 / 投递、材料库、Browser 托管任务
- [x] BYO LLM：`.env.example` 占位 + 设置 → AI 接口；Key 进系统凭据库；不连 Coolto 云 / Credit
- [x] 安装路径：`cp .env.example .env` → `npm install` → `npm run desktop:dev`（Win/macOS/Linux 源码）
- [x] 贡献入口：`CONTRIBUTING.md`、`AGENTS.md`、`local-docs/beginner-issues.md`、自测清单链接齐全
- [x] **未宣称** PRD §8 面试训练 / 模拟面试；**未宣称** §11 浏览器站点字段级记忆（README 增「开源范围说明」）
- [x] 站点边界指向 `local-docs/site-support-boundary.md`（Greenhouse/Lever 搜岗；BOSS/JobsDB/LinkedIn 为 candidate）

### 敏感清理

- [x] `.env` / `.env.local` 已被 `.gitignore`；工作树有本地 `.env` 时 **未** 被跟踪（勿 `cat` 其内容）
- [x] `.env.example` 仅空 `LLM_API_KEY=` 与公开 Base URL / 模型名占位
- [x] 增补忽略：`*.secret`、`*.pem`、`*.p12`、`*.pfx`、`.env.*.local`、`.cursor-pm/`
- [x] 跟踪树内真实个人邮箱 / 手机 / 姓名已改为占位符：
  - `test/claim-support.test.ts` → `user@example.com` / `+1 555 0100` / `Example User`
  - `scripts/cli-otp-challenge.ts` → `COOLTO_OTP_EMAIL` 或 `you@example.com`
  - `local-docs/browser-enhance/README.md` → `sender@example.com`
- [x] `scripts/prd-worktree-inventory.mjs`：去掉硬编码 `E:\vsProjects\...`，改用 `COOLTO_LOCAL_ROOT` / 相对 `localRoot`
- [x] **移出跟踪**：`.cursor-pm/`（约 269 路径，含历史本机 `E:\` worktree 证据）；目录可仍在磁盘，但不再进入索引
- [x] 自测证据目录约定脱敏（`self-test-evidence/README.md`）；抽查未把真实 `LLM_API_KEY=` 值写入已跟踪 log/md
- [x] 测试夹具中的 `sk-...` / `ghp_` / `xoxb-` / `dev@example.com` / `devpassword` 为**明显占位或本地开发假账号**，保留

### 贡献门槛文件

- [x] `LICENSE`：MIT（Copyright 2026 Coolto contributors）
- [x] `CONTRIBUTING.md`：本地开发、PR 约定、安全审核、依赖/脚本清单
- [x] `local-docs/beginner-issues.md`：5 条新手 Issue 草稿
- [x] `.github/ISSUE_TEMPLATE/`：`bug_report.md` / `feature_request.md` / `docs.md`（粘贴到公开 Tracker 前可再改 labels）

### 远程就绪说明（文档已写清；未执行 push）

- [x] 下文给出：空仓创建后如何 push **全历史**、默认分支建议、占位 remote、双托管（GitHub + Gitee）步骤
- [x] 明确：**本阶段不 push、不开 PR**；远程 URL / 账号由主人拍板

---

## 待主人拍板（通常仅远程账号 / URL）

> 下列项无法在离线本机替你完成。填空后按「推送步骤」操作即可。

| # | 项 | 建议 / 占位 | 主人填写 |
|---|----|-------------|----------|
| 1 | GitHub 账号与空仓 URL | `https://github.com/<ORG_OR_USER>/coolto-desktop.git` | |
| 2 | Gitee 账号与空仓 URL（可选镜像） | `https://gitee.com/<ORG_OR_USER>/coolto-desktop.git` | |
| 3 | 公开默认分支 | 见下「默认分支建议」 | `main` / 保留 `dev/app-complete` / 其它： |
| 4 | 是否 push **全历史**（含早期 `.cursor-pm` 曾入树的 commit） | 见「历史与敏感」 | 全历史 / 仅当前树 orphan 发布： |
| 5 | 公开仓名、简介、Topics、是否先 `Private` 再转 Public | 自定 | |
| 6 | GitHub Actions secrets（现有 `RELEASE_SERVER_*` 工作流） | 开源首发可不启用商业发布 workflow | 保留禁用 / 删除 workflow / 配置 secrets： |
| 7 | 是否在 GitHub/Gitee 创建 beginner Issues（可从 `beginner-issues.md` 粘贴） | 建议创建 3–5 条 `good first issue` | |

### 默认分支建议

- **推荐公开默认分支：`main`**  
  - 做法：空仓默认 `main` → 本地 `git branch -M main`（若当前在 `dev/app-complete`）或 `git push -u <remote> dev/app-complete:main` 只推该 tip 到 `main`（仍带可达历史）。  
  - 保留 `dev/app-complete` 为开发分支亦可：`git push -u <remote> dev/app-complete` 并在托管平台把默认分支改为它。
- 当前本地：`* dev/app-complete`，`origin` 仍指向本机 bundle（`E:\...\coolto-desktop-local-history.bundle`），**不是**公开远程。

### 历史与敏感（必读）

- 本提交起索引中**不再包含** `.cursor-pm/`。  
- 若选择 **push 全历史**，更早的 commit 里仍可能含个人路径 / 曾误写的邮箱；公开前请主人自行 `git log -p --all -S 'E:\\vsProjects' -S 'chenandrew' | less` 抽查，或改用 **orphan / squash 单 commit 发布**（失去细粒度历史，但树干净）。  
- **不要**把本机 `.env` 或任何真实 Key 加入暂存区。

---

## 新建空仓后如何 push（占位 remote；勿在未填 URL 时执行）

在主人填好 GitHub（及可选 Gitee）空仓 URL 后，于本仓执行（示例）：

```bash
# 0) 确认干净且无密钥
git status
git check-ignore -v .env
# 切勿：git add .env / git add -A（习惯性全加）

# 1) 添加公开 remote（名称自定；先不要覆盖仍指向 bundle 的 origin，除非你确认）
git remote add github https://github.com/<ORG_OR_USER>/coolto-desktop.git
# 可选镜像：
# git remote add gitee https://gitee.com/<ORG_OR_USER>/coolto-desktop.git

# 2A) 推荐：推送到 main 作为默认分支（全历史，当前 tip）
git push -u github dev/app-complete:main

# 2B) 或保留分支名
# git push -u github dev/app-complete

# 3) 可选：同步 Gitee
# git push -u gitee dev/app-complete:main

# 4) 在 GitHub/Gitee 网页：Settings → 默认分支 → main；粘贴 LICENSE 已在树内；
#    从 local-docs/beginner-issues.md 创建 Issues；按需关闭或限制 .github/workflows/*-release.yml
```

**全历史说明**：`git push` 会上传当前分支可达的全部 commit 对象。若只要「当前树一张快照」：

```bash
git checkout --orphan public-main
git add -A   # 再次确认 .env / .cursor-pm 被 ignore
git status   # 人工审
git commit -m "chore(oss): initial public snapshot"
git push -u github public-main:main
```

---

## 发布前快速自检（主人开机后 5 分钟）

```bash
npm run check          # 可选，耗时长
npm run qa:browser-agent   # 无 Key fixture
git grep -nE 'sk-[a-zA-Z0-9]{20,}|E:\\\\vsProjects|chenandrew418|263824690' -- ':!.cursor-pm' || true
```

期望：无真实 Key；个人邮箱 / `E:\vsProjects` 不在**当前树**跟踪文件中（历史另见上节）。

---

## 本轮提交

- 精确 message：`docs(oss): add publish checklist and harden README for release`
- 含：README 范围说明、敏感占位与路径去本机化、`.gitignore` / 移出 `.cursor-pm`、ISSUE_TEMPLATE、本清单

（以实际 `git rev-parse HEAD` 为准。）
