# PRD App 验收口径与结果（2026-09-13）

> **App 收口（Phase 4 + leftover 脏树）**：**真实 Electron 实测**见 [`prd-app-manual-electron-acceptance-2026-09-13.md`](./prd-app-manual-electron-acceptance-2026-09-13.md)。自动化门禁仅作开发回归，**不等同**整产品 PRD 实测完成。

## 1. 验收范围

| 层级 | 内容 |
| --- | --- |
| **Phase 4 trunk** | `837fbad` — C1/C2/C3 |
| **Leftover 脏树** | `.cursor-pm/PROGRAM.md` L40–46（≈54 文件未 commit） |
| **整本 PRD v1.1** | 非本次签字范围（见 `prd-requirements-tracker.md`） |

**工作树**：`E:/vsProjects/coolto/.codex-worktrees/prd-privacy`

---

## 2. 自动化门禁（脏树，2026-09-13 续跑）

| 门禁 | 结果 | 日志 / 说明 |
| --- | --- | --- |
| `npm run check` | **PASS** | `local-qa-data/check-2026-09-13.log`；~120s；含 test **1527 pass**、build、desktop:build |
| `npm run qa:phase-4-c2` | **PASS** | `local-qa-data/phase-4-c2-2026-09-13.log`；~74s；Node C2 + harness + browser-agent + agent-tasks-ui + phase-2:ui |
| `npm run qa:phase-4-c3` | **PASS** | 196 tests（同日早些时候已跑） |
| `check:source-lines` + typechecks | **PASS** | 1368 files |
| `prd-leftover-gaps` 等专项单测 | **PASS** | 含于 `npm test` |

**未重跑（非阻塞 leftover）**：`run-material-product-acceptance.mjs`（2026-09-12 trunk PASS）；`COOLTO_C3_RES_RUNTIME=1` 真模型 acceptance。

---

## 3. Leftover slice — Electron + 单测

| # | 能力 | 单测 / 门禁 | Electron | 结果 |
| --- | --- | --- | --- | --- |
| 1 | LLM 上传范围告知 | `prd-leftover-gaps` | A、B 截图 | **PASS** |
| 2 | 关窗进托盘 + 脏稿 prompt | `window-close-policy` | `manual-m23` native + 无脏稿 alive | **PASS** |
| 3 | 分析 JD → **自动发聊天** | instruction 单测 | f-analyze-jd-handoff-chat.png | **PASS** |
| 4 | HTTPS 抓 JD（无浏览器） | registry + system-prompt | [`g-https-agent-with-key.png`](./prd-leftover-electron-qa-2026-09-13/g-https-agent-with-key.png) | **PASS** |
| 5 | 准备面试问题 | job-flow 文案 | `manual-m12`、`cdp-tracker-create-app` | **PASS** |
| 6 | 匹配报告 CTA | `MatchReportPanel` 断言 | 经历库已 seed；修复 `exp_` 引用解析后 Electron 侧栏 CTA **PASS**（见下） | **PASS** |
| — | 设置用量 / 置顶 | Settings 源码断言 | B 截图 | **PASS** |

### Agent 全链（使用 `cv-agent-app/.env` 密钥，2026-09-13 续跑）

Driver / dev 登录通过 `readDotEnvFile()` 读取 `E:/vsProjects/coolto/cv-agent-app/.env`（**API 仍强制** `http://127.0.0.1:8080`，避免 `.env` 里生产 API 导致 404）。

| 项 | 结果 | 证据 |
| --- | --- | --- |
| **G** 粘贴 HTTPS 抓 JD | **PASS**（Agent 真实调用） | [`g-https-agent-with-key.png`](./prd-leftover-electron-qa-2026-09-13/g-https-agent-with-key.png) — 抓取 `example.com` 成功，正确判定非 JD |
| **H** 匹配报告 + CTA | **PASS** | [`qa-experience-repo-seeded.png`](./prd-leftover-electron-qa-2026-09-13/qa-experience-repo-seeded.png) 经历库 seed；[`h-match-panel-cta-pass.png`](./prd-leftover-electron-qa-2026-09-13/h-match-panel-cta-pass.png) 匹配卡片 + 侧栏「基于此报告生成简历」 |

### Agent 全链环境阻塞（G / H / 任意 send）— 已解除

此前未配密钥；**续跑已用 `cv-agent-app/.env`**。若仍报错，确认 `DEEPSEEK_API_KEY` 或 Gateway 在 `.env` 中非空。

~~Electron 发送后界面错误：~~（历史记录，已由 dotenv 修复）

~~截图：g-https-jd-send.png~~

---

## 4. Phase 4 收口状态（脏树）

| 项 | 2026-09-13 |
| --- | --- |
| `npm run check` | **PASS** |
| `qa:phase-4-c2` | **PASS** |
| `qa:phase-4-c3` | **PASS** |
| `phase-4-manual-test-checklist.md` | OAuth / PLAT 200% / 真模型 RES 等仍 **U**（与 2026-09-12 一致） |

---

## 5. 签字口径（App PRD 收口）

- **代码门禁（脏树）**：可视为 **已满足** Phase 4 自动化 + leftover 单测。
- **Electron leftover + PRD 矩阵**：见 [`prd-app-manual-electron-acceptance-2026-09-13.md`](./prd-app-manual-electron-acceptance-2026-09-13.md) 与 [`prd-app-full-product-acceptance-2026-09-13.md`](./prd-app-full-product-acceptance-2026-09-13.md)（2026-09-13 续跑 **`cdp-prd-final-gaps.mjs`** 收口）。

索引：`prd-leftover-electron-qa-2026-09-13.md` · 日志：`prd-privacy/local-qa-data/check-2026-09-13.log`、`phase-4-c2-2026-09-13.log`
