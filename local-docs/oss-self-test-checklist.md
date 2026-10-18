# 开源自测清单（无 Key / 有 Key）

面向贡献者与维护者：在配置真实 LLM API Key **之前**先跑完「无需 LLM」项；拿到 Key 后再跑「需要 LLM」主路径。站点叙述必须与 [`site-support-boundary.md`](./site-support-boundary.md) 及 `src/browser/recruiting-site-policy.ts` 一致——Greenhouse/Lever 仅为 Job Scout **搜岗来源**；BOSS / JobsDB / LinkedIn 保持 **`candidate`**，不得写成 verified 或稳定全自动投递。

证据约定目录：[`self-test-evidence/`](./self-test-evidence/)（见该目录 README）。GUI 点通步骤见 [`oss-gui-self-test.md`](./oss-gui-self-test.md)。

---

## 脚本命名速查（`package.json`）

| 前缀 / 名 | 含义 | 是否依赖 LLM |
|-----------|------|----------------|
| `typecheck` / `desktop:typecheck` | Node / Vue 类型检查 | 否 |
| `test` | `node --test` 单测（`test/**/*.test.ts`） | 否 |
| `check` | 模板一致性 + 行数门禁 + 双 typecheck + test + Node/桌面构建 | 否（构建本身不调模型） |
| `check:resume-template` / `check:source-lines` | 文档/资产门槛子项 | 否 |
| `desktop:dev` / `desktop:build` | Electron 开发 / 构建 | 否（对话能力需 Key 才有意义） |
| `qa:*` | 专项 QA（多数走 fixture / 本地 HTTP，不调真实招聘站） | 多数否；见各节 |
| `smoke:*` | 冒烟（如 `smoke:desktop-chat` 需已启动桌面 + CDP） | 视场景 |
| `eval:*` | 评估脚本（简历 Agent 等） | 通常需要 LLM |
| `package:win` / `package:mac*` | 打包 + 硬化校验 | 否 |

§1 投递闭环的 **托管 fixture/QA** 入口是 `npm run qa:browser-agent`（内部启动本地 fixture HTTP，并调用 `src/cli/browser-managed-apply-qa.ts`）。**不要**为验收去改 candidate 真站状态。

---

## 一、无需 LLM

完成下列勾选即可认为「无 Key 门禁」通过。任一项失败先修文档/代码再进有 Key 路径。

### 1.1 类型检查、单测、全量 check

- [ ] `npm run typecheck`
- [ ] `npm run desktop:typecheck`
- [ ] `npm run test`
- [ ] （提交前建议）`npm run check`  
  依次：`check:resume-template` → `check:source-lines` → `typecheck` → `desktop:typecheck` → `test` → `build` → `desktop:build`

期望：全部 exit 0。日志中**不得**出现真实 API Key。

### 1.2 文档与开源门槛

- [ ] 根目录 [`README.md`](../README.md) 可读：本地 Desktop、自备 OpenAI 兼容接口、无云/无 Credit
- [ ] [`CONTRIBUTING.md`](../CONTRIBUTING.md) 含本地开发、精确 `git add`、安全审核（禁提交密钥、禁日志打 Key）
- [ ] [`LICENSE`](../LICENSE) 为 MIT
- [ ] [`beginner-issues.md`](./beginner-issues.md) ≥3 条新手友好草稿
- [ ] 开源 PRD：[`PRD-open-source-desktop.md`](./PRD-open-source-desktop.md)
- [ ] 本清单与 GUI 步骤文档存在且链接有效

### 1.3 站点边界与 policy 一致

- [ ] 阅读 [`site-support-boundary.md`](./site-support-boundary.md)
- [ ] 对照 `src/browser/recruiting-site-policy.ts`：`boss_zhipin` / `jobsdb_hk` / `linkedin` 均为 `status: "candidate"` 且 `verifiedAt: null`
- [ ] README / Issue / 本清单未把 Greenhouse/Lever 写成已验收投递站点
- [ ] 相关单测可抽跑：`node --import tsx --test test/recruiting-site-policy.test.ts test/site-policy-registry.test.ts`（或整包 `npm run test`）

### 1.4 Fixture / QA（无真实招聘站、无 LLM）

下列命令使用仓库内 **托管 fixture** 或本地 UI harness，**不要求**真实站点，也**不要求** `LLM_API_KEY`。

| 命令 | 覆盖 | 期望证据 / 输出 |
|------|------|-----------------|
| `npm run qa:browser-agent` | Browser Shell + SITE + **managed apply**（`browser-managed-apply-qa.ts`，本地 fixture 表单提交与回执/Application 去重） | 终端 JSON report；断言含 `14c SubmissionIntent confirms fixture form`、`14d SubmissionReceipt creates Tracker once` 等；可选把 stdout 保存到 `local-docs/self-test-evidence/qa-browser-agent-*.log`（`.log` 可提交；`.json` 默认被 gitignore） |
| `npm run qa:browser-shell` | Browser Shell UI QA | exit 0 |
| `npm run qa:browser-shell:manual` | Shell 手工辅助入口 | 按脚本提示操作 |
| `npm run qa:agent-harness` | Agent harness + 加密邮件盘 | 临时 `report.json`；exit 0 |
| `npm run qa:agent-tasks-ui` | Agent 任务 / mail loop UI | exit 0 |
| `npm run qa:phase-2` | Phase 2 相关门禁 | exit 0 |
| `npm run qa:phase-4-c2` | C2：含 SITE policy 单测 + `qa:browser-agent` 等 Electron 门 | exit 0；真站项应标为 fixture 已覆盖、非强制真站 |
| `npm run qa:phase-4-c3` | Phase 4 C3 门禁 | exit 0 |
| `npm run qa:phase-2:ui` / `qa:job-scout` | 画像偏好 UI / Job Scout QA | 按脚本；Job Scout 不升格为投递 verified |
| `npm run qa:resume-renderer` | 简历渲染/PDF fixture（构建桌面后跑） | 产物路径由 `COOLTO_RESUME_QA_*` 控制；可复制截图/PDF 到 evidence（png/pdf 已 gitignore） |
| `npm run smoke:resume-source` | 简历源冒烟 | exit 0 |

说明：

- `qa:browser-agent` 会先 `desktop:build` 再打包 `src/cli/browser-agent-qa-entry.ts`；首次较慢属正常。
- `qa:browser-webmail-live` 面向真实 Webmail，**不**列入无 Key 必跑。
- Phase-4 C2 手动词里的「真站招聘表单」明确写了 fixture 已由 `qa:browser-agent` 覆盖——开源 §1 自测以 fixture 为准。

### 1.5 打包资源（无 Key，按需）

- [ ] `build/` 存在且含 Electron Builder 所需资源：`entitlements.mac.plist`、`icon.png`、`material-ocr/*.traineddata`（见 `electron-builder.yml` 的 `buildResources` / extraResources）
- [ ] 若本地误删，用 `git restore -- build/` 恢复 **tracked** 文件，勿从未知来源拷贝

### 1.6 无 Key 结论

- [ ] 上述必选项通过
- [ ] 可将简短命令日志（脱敏）放入 `local-docs/self-test-evidence/`
- [ ] **可以进入「等待 Key」状态**；主路径对话 / §2 简历质量样本仍须 Key

---

## 二、需要 LLM

**环境变量名**（只写名字，勿把真实 Key 写入仓库或证据文件）：

| 变量 | 用途 |
|------|------|
| `LLM_BASE_URL` | OpenAI 兼容 Base URL（见 `.env.example`） |
| `LLM_API_KEY` | API Key；优先随后写入系统凭据库 |
| `LLM_MODEL` | 模型名 |
| 兼容别名 | `OPENAI_BASE_URL` / `OPENAI_API_KEY` / `DEEPSEEK_API_KEY` |

推荐流程：`cp .env.example .env` → 填入上述变量 → `npm run desktop:dev` → 在 **设置 → AI 接口** 保存（Key 进 OS credential store）。证据与截图**打码** Key。

详细 GUI 步骤：[`oss-gui-self-test.md`](./oss-gui-self-test.md)。

### 2.1 §1 投递闭环（以 fixture/QA 为主，不要求真站）

目标对齐 PRD §1：选简历 → 打开申请页 → 填表 → 确认提交 → 本机 Application/回执。开源验收以 **托管 fixture** 为准；candidate 真站保持 candidate。

- [ ] 无 Key 的 `npm run qa:browser-agent` 已绿（managed apply + SubmissionIntent/Receipt）
- [ ] （可选加强）`npm run qa:phase-4-c2` 全绿
- [ ] GUI：按 [`oss-gui-self-test.md`](./oss-gui-self-test.md) §1，用对话/Agent 任务在 **fixture 或本地页** 走一遍审批与提交确认（若暂无本地页，保留 QA 日志即可）
- [ ] 证据落点：`local-docs/self-test-evidence/section-1/`  
  - QA 终端日志  
  - GUI 截图：任务状态、审批卡片、Tracker 中 Application（打码隐私）  
  - **不要**为冲勾选把 candidate 站点改为 verified

### 2.2 §2 简历质量样本

目标对齐 PRD §2：通用 / 针对 JD / user_directed / 历史复用各至少一条可交付或明确终态样本；预览 = 保存 = PDF 同源。

- [ ] 配置 LLM 后 `npm run desktop:dev`
- [ ] 对话中分别完成：针对性 JD、通用简历、user_directed、历史草稿复用（步骤见 GUI 文档）
- [ ] （可选）`npm run qa:resume-renderer` 验证渲染/PDF fixture
- [ ] （可选）`npm run eval:resume-agent`（需 LLM）
- [ ] 证据落点：`local-docs/self-test-evidence/section-2/`  
  - 预览截图、导出 PDF（本地保留；png/pdf 默认不入库）、终态说明（可交付 / 未达标草稿等）  
  - 确认无编造量化、无密钥进日志

### 2.3 有 Key 结论

- [ ] §1 fixture/QA +（可选）GUI 审批链证据齐全
- [ ] §2 至少各路径一条样本与证据
- [ ] 站点文案仍符合 `site-support-boundary.md`

---

## 相关路径速查

| 路径 | 说明 |
|------|------|
| `src/cli/browser-managed-apply-qa.ts` | Managed apply QA 逻辑（由 browser-agent QA 调用） |
| `src/cli/browser-agent-qa-entry.ts` | Browser Agent QA 入口 |
| `src/cli/browser-agent-qa-fixtures.ts` / `browser-agent-qa-server.ts` | 本地 fixture HTML / HTTP |
| `src/browser/recruiting-site-policy.ts` | 站点 status / verifiedAt 源码 |
| `scripts/run-browser-agent-qa.mjs` | `qa:browser-agent` 启动器 |
| `scripts/run-phase-4-c2-gates.mjs` | C2 门禁（含 browser-agent） |
| `.env.example` | 仅变量名模板 |

---

## 三、P0 §3–§5（本机可观测 / 隐私 / 安装）

无需 LLM。证据目录：`local-docs/self-test-evidence/section-3|4|5/`。

### 3.1 §3 本机可观测性

- [ ] 阅读 [`local-diagnostics.md`](./local-diagnostics.md) 与 [`CONTRIBUTING.md`](../CONTRIBUTING.md)「本机可观测性」
- [ ] `node --import tsx --test test/local-diagnostics.test.ts` 通过
- [ ] 抽查默认日志/诊断 JSONL 无 Key 与正文

### 3.2 §4 本机隐私与数据控制

- [ ] 设置 → 隐私与数据：可见「导出本机数据」「清除本机数据」；文案无「云端仍保留」误导
- [ ] 隐私同意展示政策版本；重大变更（`privacy-2026-10-18-v1`）需重确认
- [ ] 相关单测：`test/privacy-ui-contract.test.ts` 等

### 3.3 §5 跨平台安装与更新（必达）

- [ ] README「桌面开发与跨平台安装」含 Win/mac/Linux 源码启动与 API 配置
- [ ] README 写明开源版自行管理版本；自动更新非必达
- [ ] 平台能力降级表（通知 / 日历 / Linux keyring）可读

