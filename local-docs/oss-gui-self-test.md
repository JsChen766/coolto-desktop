# GUI 自测步骤（§1 / §2）

本文配合 [`oss-self-test-checklist.md`](./oss-self-test-checklist.md)。步骤基于仓库真实脚本与路径；**可以只准备、暂不跑**。跑 GUI 前建议无 Key 清单中的 `typecheck` / `test` / fixture QA 已绿。

**禁止**：把真实 `LLM_API_KEY` 写入截图未打码区域、日志文件或本仓库任意路径；勿读他人 `.env` 密钥值。

---

## 0. 启动桌面（`desktop:dev`）

前置：Node.js ≥ 22.13。

```bash
cd /path/to/coolto-desktop-local
cp .env.example .env   # 仅首次；填 LLM_BASE_URL / LLM_API_KEY / LLM_MODEL（变量名见 .env.example）
npm install
npm run desktop:dev
```

期望：

1. Electron 窗口打开；侧栏可见对话、Agent 任务、经历仓库、求职仓库、材料库、投递追踪等。
2. 打开 **设置**（`src/desktop/renderer/src/components/SettingsDialog.vue`）→ **AI 接口**（`AiProviderSettings.vue`）：可保存 Base URL / Model / Key；Key 应进系统凭据库，而非明文长期躺在渲染层。
3. 无 Key 时：界面可浏览仓库类页面；对话生成应失败或提示配置，**不应**静默伪造成功。

可选冒烟（需桌面已开且暴露 CDP，默认 `http://127.0.0.1:9222`）：

```bash
# 环境变量名（无密钥）：COOLTO_SMOKE_CDP、COOLTO_SMOKE_TIMEOUT_MS
npm run smoke:desktop-chat
```

驱动入口：`scripts/coolto-desktop-driver.mjs`（`npm run desktop:driver`）。

截图/日志建议保留：

- 启动后主窗口侧栏全貌  
- 设置 → AI 接口（**Key 打码**）  
- 终端 `desktop:dev` 启动无报错片段（脱敏）  
- 落点：`local-docs/self-test-evidence/gui-smoke/`

---

## 1. §1 投递闭环：fixture / QA 与 GUI

### 1.A 必跑：托管 fixture QA（不要求真站、不要求 LLM）

```bash
npm run qa:browser-agent
```

行为摘要（实现入口）：

1. `desktop:build`  
2. esbuild 打包 `src/cli/browser-agent-qa-entry.ts` → `out/cli/browser-agent-qa-entry.cjs`  
3. `scripts/run-browser-agent-qa.mjs` 拉起 Electron QA 应用 `src/cli/browser-agent-qa-app`  
4. 本地 HTTP fixture（`browser-agent-qa-server.ts` + `browser-agent-qa-fixtures.ts`）提供申请页  
5. `runManagedApplyQa`（`src/cli/browser-managed-apply-qa.ts`）走 SubmissionIntent 确认、提交、回执与 Application 去重  

期望证据：

- 终端最终 JSON：`suiteVersion` 匹配、相关 case `passed: true`（含 `14c` / `14d`）  
- 保存：`local-docs/self-test-evidence/section-1/qa-browser-agent.log`（推荐）  
- 可选环境变量名：`COOLTO_BROWSER_QA_REPORT`（见 `src/cli/browser-agent-qa-report.ts`）

聚合门禁（仍以 fixture 为主，非真站）：

```bash
npm run qa:phase-4-c2
```

### 1.B GUI 点通（需要 LLM 时更有意义；无本地申请页时可跳过并保留 1.A）

1. `npm run desktop:dev`  
2. **经历仓库 / 求职仓库**：确保本机至少有一份可用简历资产（可先用对话沉淀经历，或已有本地草稿）。  
3. 打开 **Agent 任务** 或对话，发起「在已授权范围内打开申请页并准备填写」类目标。  
4. 优先使用 **本地 fixture URL**（QA 服务器仅在 `qa:browser-agent` 进程内；日常 GUI 可用自建静态页或文档约定的本地页）。**不要**为验收去操作并把 BOSS/JobsDB/LinkedIn 写成已 verified。  
5. 观察：Browser Shell 多标签、Agent 可见层；登录/OTP/CAPTCHA/法律声明应进入「等待用户」而非静默绕过。  
6. 字段写入走 **Proposal → 审批卡片**（接受 / 拒绝）；最终提交须专门确认。  
7. **投递追踪**：成功应出现 Application / 回执；拒绝最终提交则网站未提交且本机无新 Application。

截图/日志该留什么：

| 项 | 内容 |
|----|------|
| 任务态 | 运行中 / 等待用户 / 完成 |
| 审批 | 审批卡片字段与用户选择（打码隐私） |
| Browser | 申请页关键步骤（可裁剪） |
| Tracker | Application 一条；失败时错误可读 |
| 日志 | 主进程/终端阶段线；无 Key、无简历全文 |

落点：`local-docs/self-test-evidence/section-1/`。

站点政策只读核对：

```bash
# 确认 candidate 未被人改成 verified（无 Key）
rg -n 'siteId: "(boss_zhipin|jobsdb_hk|linkedin)"|status:|verifiedAt' src/browser/recruiting-site-policy.ts
```

---

## 2. §2 简历质量样本（需要 LLM）

### 2.A GUI 四条样本

1. `npm run desktop:dev`，确认 AI 接口可用。  
2. 侧栏进入 **对话**。  
3. 分别发起并跑到明确终态（可交付 / 等补充 / 未达标草稿 / 取消 / 失败）：

| 样本 | 提示意图（示例措辞，可改） | 期望 |
|------|---------------------------|------|
| 针对 JD | 粘贴真实 JD 原文，请求生成一页针对性简历 | 事实可追溯；不编造量化 |
| 通用 | 不绑定虚构岗位，请求通用一页简历 | 不伪造岗位覆盖率 |
| user_directed | 明确指定仅用某几段经历 | 不掺入未指定经历；缺口可警告 |
| 历史复用 | 基于已有本机草稿/历史再生成或微调 | 不改坏原草稿；新结果重验版面 |

4. 打开简历预览（A4）：**保存到简历库** 与 **导出 PDF** 应对同一内部修订。  
5. 材料不足时：最多追问关键缺口；用户说「没有更多」后应停止同问并交付现有事实允许的最好版本（可标未达标）。

### 2.B 可选：渲染 QA / eval（命令真实存在）

```bash
# 构建后跑简历渲染 fixture；产物环境变量名：
# COOLTO_RESUME_QA_ARTIFACT_DIR, COOLTO_RESUME_QA_RESULT_PATH,
# COOLTO_RESUME_QA_PDF_PATH, COOLTO_RESUME_QA_SCREENSHOT_PATH, ...
npm run qa:resume-renderer

# 需要 LLM 的评估（耗时；按需）
npm run eval:resume-agent
```

截图/日志该留什么：

- 四条样本各一张预览图（或 PDF 本地路径说明）  
- 终态文案或对话末条摘要（脱敏）  
- 若跑了 renderer QA：结果摘要日志  

落点：`local-docs/self-test-evidence/section-2/`。  
注意：`local-docs/**/*.png` / `*.pdf` / `*.json` 已被 `.gitignore`；证据默认可只留在本机，或改用 `.md` / `.log` 描述路径与结论。

---

## 3. 不做的事

- 不 push、不开 PR、不改 remote（除非维护者另行授权）。  
- 不把 candidate 站点升为 verified。  
- 不改 agent prompt 大逻辑来「刷绿」自测。  
- 不把 Key 写入 `local-docs/`、Issue 或 commit message。
