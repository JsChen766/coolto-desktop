# Coolto 开源发布清单（本地可交付）

日期：2026-10-18（Asia/Shanghai）  
仓：`/workspace/coolto-desktop-local`  
本清单轮次基线 HEAD：见文末「本轮提交」（提交后以 `git rev-parse HEAD` 为准）  
约束：**不 push、不开 PR**；真实 Key 不写入任何文件或本清单。

---

## 已代决 / 已勾项

### README / 产品宣称

- [x] 主路径清晰：对话 Agent、经历 / JD / 简历 / 投递、材料库、Browser 托管任务
- [x] BYO LLM：`.env.example` 占位 + 设置 → AI 接口；Key 进系统凭据库；不连 Coolto 云 / Credit
- [x] 安装路径：`cp .env.example .env` → `npm install` → `npm run desktop:dev`（Win/macOS/Linux 源码）
- [x] 贡献入口：`CONTRIBUTING.md`、`AGENTS.md`、`local-docs/beginner-issues.md`、自测清单链接齐全
- [x] **未宣称** PRD §8 面试训练 / 模拟面试；**未宣称** §11 浏览器站点字段级记忆（README 增「开源范围说明」）
- [x] 站点边界指向 `local-docs/site-support-boundary.md`（Greenhouse/Lever 搜岗；BOSS/JobsDB/LinkedIn 为 candidate）

### 敏感清理（当前树）

- [x] `.env` / `.env.local` 已被 `.gitignore`；工作树有本地 `.env` 时 **未** 被跟踪（勿 `cat` 其内容）
- [x] `.env.example` 仅空 `LLM_API_KEY=` 与公开 Base URL / 模型名占位
- [x] 增补忽略：`*.secret`、`*.pem`、`*.p12`、`*.pfx`、`.env.*.local`、`.cursor-pm/`
- [x] 跟踪树内真实个人邮箱 / 手机 / 姓名已改为占位符
- [x] `scripts/prd-worktree-inventory.mjs`：去掉硬编码本机 `E:\...` 路径
- [x] **移出跟踪**：`.cursor-pm/`（历史 commit 仍可达，见下「历史敏感抽查」）
- [x] 测试夹具中的 `sk-...` / `ghp_` / `xoxb-` / `*@example.*` 为**明显占位**，保留

### 贡献门槛 / beginner Issues

- [x] `LICENSE`：MIT；`CONTRIBUTING.md`；`.github/ISSUE_TEMPLATE/`
- [x] `local-docs/beginner-issues.md`：5 条草稿
- [x] **可粘贴正文**：`local-docs/beginner-issues-ready-to-post.md`（3–5 条 good first issue，已就绪；等公开仓后由主人粘贴）

### 默认分支（已代决）

- [x] **公开默认分支：`main`**
- [x] 推送命令：`git push -u <remote> dev/app-complete:main`（全历史，当前 tip → 远程 `main`）
- [x] 本地仍可保留分支名 `dev/app-complete`；托管平台 Settings → 默认分支设为 `main`

### 历史策略（已代决：全历史 push）

- [x] 选择 **全历史 push**（非 orphan）
- [x] 已跑历史敏感抽查（见下节结论）；有硬伤 → 已写 **Plan B orphan** 步骤，**未执行 orphan**

### 商业 release workflow（已代决：禁用自动跑）

- [x] `win-release.yml` / `mac-release.yml`：去掉 tag `push` 触发，**仅 `workflow_dispatch`**
- [x] `homepage-deploy.yml`：保持仅 `workflow_dispatch`；无 `RELEASE_SERVER_*` 时 **整 job 跳过**（不红）
- [x] `macos-universal.yml`：本就仅 `workflow_dispatch`（上传 artifact，无发布服务器 secrets）
- [x] 上传步骤在缺 `RELEASE_SERVER_*` 时 skip；**勿**在公开仓把这些 secrets 配成必填
- [x] README / 本清单已注明：不配置则不跑商业上传

### 远程就绪说明（文档已写清；未执行 push）

- [x] 下文给出：空仓创建后如何 push **全历史**、默认分支、占位 remote、双托管步骤
- [x] 明确：**本阶段不 push、不开 PR**

---

## 仅剩：等主人填 URL

> 下列项无法在离线本机替你完成。填空后按「推送步骤」操作即可。

| # | 项 | 状态 | 主人填写 |
|---|----|------|----------|
| 1 | GitHub 空仓 URL | **⏳ 等待** | `https://github.com/<ORG_OR_USER>/coolto-desktop.git` |
| 2 | Gitee 空仓 URL（可选镜像） | **⏳ 等待** | `https://gitee.com/<ORG_OR_USER>/coolto-desktop.git` |
| 3 | 公开默认分支 | **✅ 已代决 `main`** | — |
| 4 | 是否 push 全历史 | **✅ 已代决：全历史**（硬伤见抽查；Plan B 已文档化未执行） | — |
| 5 | 仓名 / 简介 / Topics / 先 Private 再 Public | 主人自定（可与 URL 一并定） | |
| 6 | GitHub Actions `RELEASE_SERVER_*` | **✅ 已代决：不配置则不跑**；workflow 仅手动 | — |
| 7 | 创建 beginner Issues | **✅ 正文已备** → `beginner-issues-ready-to-post.md`；等 URL 后粘贴 | — |

---

## 历史敏感抽查（2026-10-18 Asia/Shanghai）

命令要点（本机已跑；**勿把真实 Key / 完整个人标识写入清单**）：

```bash
git log --all --pretty=format:'%h %s' -S 'E:\vsProjects' --name-only
git log -p --all -S 'chenandrew'   # 个人邮箱曾入树；当前 tip 已占位
git log -p --all -S '263824690'    # 个人 qq 曾入树；当前 tip 已占位
git log -p --all -G 'sk-[a-zA-Z0-9]{24,}' -- test/ src/
git grep -nE 'sk-[a-zA-Z0-9]{20,}|E:\\vsProjects' -- ':!.cursor-pm' || true
```

### 结论摘要

| 类别 | 当前 tip（跟踪树） | 全历史（可达旧 commit） | 判定 |
|------|-------------------|-------------------------|------|
| `E:\vsProjects` 本机路径 | 仅本清单文档提及；业务脚本已去硬编码 | **硬伤**：多见于已移出跟踪的 `.cursor-pm/**` 证据/说明，以及更早 `docs/*`；`a0c3a10` 起索引不再含 `.cursor-pm/`，但对象仍在历史 | 全历史公开会暴露本机目录结构 |
| 真实个人邮箱 | **无**（已改为 `*@example.com` / env 占位） | **硬伤**：曾出现在 `test/claim-support.test.ts`、`scripts/cli-otp-challenge.ts`、`local-docs/browser-enhance/README.md` 等旧 blob | 全历史可被 `git log -p` / `git grep` 挖出 |
| 手机号 | 当前树为 `+852 5555…` / 测试假号 | 抽查未发现独立真实手机硬编码（邮箱为主） | 可接受 |
| API Key 模式 `sk-` / `ghp_` / `AKIA` | 仅测试夹具明显假值（如 `sk-abcdef…`、`ghp_1234…`、`AKIA…EXAMPLE`） | 同上，未见「长随机真实 Key」形态 | **无真实 Key 硬伤** |
| 发布服务器 IP / 域名 | `local-docs/*runbook*` 等仍有商业运维说明与公网 IP | 同左 | 非 Key；开源可接受或日后删减运维文，非阻断 |

**总判**：选全历史 push **可执行**，但历史含 **本机路径 + 曾用个人邮箱** → 视为硬伤级隐私残留。主人若不能接受，用下方 **Plan B orphan**（**本文档化，本轮未执行**）。

### Plan B — orphan 单快照发布（勿在未再确认时执行）

> 失去细粒度 git 历史；仅当前树一张干净快照。**本轮按代决不执行。**

```bash
# 确认工作区干净、.env 未被跟踪
git status
git check-ignore -v .env

git checkout --orphan public-main
git add -A
# 再次人工审：不应出现 .env、.cursor-pm、真实 Key
git status
git commit -m "chore(oss): initial public snapshot"

# 填好 URL 后：
# git remote add github https://github.com/<ORG_OR_USER>/coolto-desktop.git
# git push -u github public-main:main
```

回退本地 orphan 试验（若曾误执行且未 push）：`git checkout dev/app-complete` 并删除 `public-main`。

---

## 新建空仓后如何 push（占位 remote；**等 URL；勿在未填时执行**）

```bash
git status
git check-ignore -v .env
# 切勿：git add .env / 习惯性 git add -A

git remote add github https://github.com/<ORG_OR_USER>/coolto-desktop.git
# 可选：git remote add gitee https://gitee.com/<ORG_OR_USER>/coolto-desktop.git

# 已代决：全历史 → 远程默认 main
git push -u github dev/app-complete:main
# git push -u gitee dev/app-complete:main

# 网页：Settings → 默认分支 → main
# 从 local-docs/beginner-issues-ready-to-post.md 粘贴 Issues
# 不要配置 RELEASE_SERVER_*（除非你要手动跑商业发布 workflow）
```

---

## 发布前快速自检（主人开机后 5 分钟）

```bash
npm run qa:browser-agent   # 无 Key fixture
git grep -nE 'sk-[a-zA-Z0-9]{20,}|E:\\vsProjects' -- ':!.cursor-pm' || true
# 历史抽查见上节；勿在公开评论粘贴真实邮箱/Key
```

期望：当前树无真实 Key；个人标识不在**当前 tip** 跟踪文件中（历史残留见抽查结论）。

---

## 本轮提交

- 精确 message：`docs(oss): finalize publish prep — history scan, release workflows, issues`
- 含：历史抽查结论 + Plan B（未执行）、release workflow 仅 dispatch、beginner 可粘贴稿、本清单代决勾选
- **仅剩等 URL**；**不 push**
