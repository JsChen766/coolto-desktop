# Capability Gap Closure PRD — 自动化方案与 §1–§4 对照矩阵

> **PRD 来源**：`coolto-capability-gap-closure-prd.md`（桌面版，12 个能力域）  
> **本文范围**：§1–§4 的「最终验收勾选项」→ **可自动化（模拟）** vs **仍需人工**；App / BE / Admin 分列。  
> **更新**：2026-09-17  
> **原则**：不发送真实用户数据、不依赖生产 API；本地 Docker / fixture / 单测 / CDP 隔离 profile。

---

## 1. 结论摘要

| 维度 | 说明 |
| --- | --- |
| **已有控制面** | `npm run desktop:driver`（CDP 点击/输入/截图/`eval`）+ `scripts/support/coolto-desktop-*.mjs`；`qa:phase-4-c2/c3` 已把 §1/§2/§4 大量逻辑映射到 **Node 单测** 与 **fixture 浏览器 QA**。 |
| **Codex 历史实测** | 证据在 `prd-app-manual-electron-acceptance-2026-09-13.md`；驱动脚本当时多在 `local-qa-data/desktop-driver/`（**未入库**），入口应统一为 **`desktop:driver` + 待回迁的 `scripts/qa/cdp-*.mjs`**。 |
| **本次实测（2026-09-17）** | `desktop:driver status`：session 存在但 **进程已死**（`alive: false`，CDP fetch failed）。`application-submission` + `submission-receipt-recovery` 单测 **13/13 PASS**（纯模拟，无公网）。 |
| **PRD 签字缺口** | §1 真站、§2 真模型 600s + Section H、§3 **App 端事件上报缺失**、§4 删号/导出 **端到端 Electron** 仍缺一键 gate。 |
| **推荐门禁** | 新增 `npm run qa:capability-gap-prd`（见 §3），CI/提交前跑 **T0–T2**；T3（CDP UI）本地可选；T4（真站/真模型）保持 **opt-in**。 |

---

## 2. 现有自动化资产（按层级）

### T0 — Node 单测（零 UI，全模拟）

| 脚本 / 入口 | 覆盖 PRD 域 | 说明 |
| --- | --- | --- |
| `npm run qa:phase-4-c3` | §1 DEL、§2 RES/SCORE、§4 PRI、§3 部分 ANA | 见 `scripts/run-phase-4-c3-gates.mjs` 的 `NODE_TIERS` |
| `test/application-submission.test.ts` | §1.3 #5–#8 | 拒绝提交、单 receipt+Application、pending 不重投 |
| `test/submission-receipt-recovery.test.ts` | §1.3 #7–#8 | SQLite 重开恢复 receipt↔Application |
| `test/recruiting-form-execution.test.ts` | §1.3 #9 | fixture 表单执行 |
| `test/recruiting-takeover-recovery.test.ts` | §1.3 #4 | 接管恢复（非真站） |
| `test/privacy-*.test.ts`（多文件） | §4.3 大半 | export crypto、deletion service、local clear、IPC 校验 |
| `test/privacy-api.test.ts` | §4 | **Mock HTTP** 的 PrivacyApi，无真实云端 |
| `test/resume-*`（source/quality/batch） | §2.3 #7–#9 | general / user_directed / 质量信号 |
| `test/site-policy-registry.test.ts` | §1.3 #1 | 站点策略注册表（非用户可见文案） |

### T1 — 进程内 QA（Electron fixture / 无 LLM）

| 入口 | 覆盖 | 说明 |
| --- | --- | --- |
| `npm run qa:browser-agent` | §1 机制 | 招聘 **fixture 域**（`*.test`），非公网 |
| `npm run qa:browser-shell` | §5 部分 | Shell UI fixture |
| `scripts/run-resume-runtime-acceptance.mjs` | §2.3 #11 | **隔离 Electron + CDP + `__cooltoRuntimeProbe` 注入 IPC**，合成简历路径 save/export（`COOLTO_C3_RES_RUNTIME`） |
| `scripts/run-material-product-acceptance.mjs` | §10 部分 | 材料库 adversarial 单测 bundle |

### T2 — BE 隔离栈（Docker，无生产 DB）

| 入口 | 覆盖 | 说明 |
| --- | --- | --- |
| `prd-admin-analytics-handback-be/scripts/run-analytics-handback-db-acceptance.py` | §3 | 隔离 Postgres + ingest/投影/隐私擦除；**禁止**对共享 `cv-agent-app-be` `migrate up` |
| `COOLTO_C3_ANA_BACKEND=1`（phase-4-c3 文档） | §3 | 同上，handback worktree |
| `cv-agent-be` `internal/modules/privacy/*_test.go` | §4 | 删号审计 append-only、export snapshot 等 |

### T3 — CDP 驱动真实 Electron（隔离 user-data，可零 LLM）

| 入口 | 能力 |
| --- | --- |
| `npm run desktop:driver launch` | `electron-vite dev --remoteDebuggingPort` + `local-qa-data/desktop-driver/user-data` |
| `desktop:driver snapshot \| click \| type \| file \| screenshot \| eval` | `data-testid` / selector；`COOLTO_QA_MATERIAL_PATHS` 注入文件选择 |
| `scripts/run-dev-desktop-login.mjs` | 无 UI 灌 session（仍指向 `:8080`，可用本地 Docker 测试账号） |
| 历史（待回迁 git） | `cdp-prd-final-gaps.mjs`、`cdp-tracker-create-app.mjs` 等 — 见 `prd-app-manual-electron-acceptance-2026-09-13.md` |

**环境变量（模拟优先）**

| 变量 | 作用 |
| --- | --- |
| `COOLTO_QA_API_BASE_URL` | 强制 `http://127.0.0.1:8080`（`qaSpawnEnv`） |
| `COOLTO_QA_MATERIAL_PATHS` | 材料导入不弹系统对话框 |
| `COOLTO_QA_PDF_SAVE_PATH` | PDF 导出路径固定 |
| `COOLTO_C3_RES_RUNTIME=1` | 合成简历 runtime acceptance（非真模型） |
| **勿设** | 生产 API URL、`PRIVACY_ENFORCEMENT_ENABLED=true` 对未发版 App |

### T4 — Opt-in 真环境（**不纳入**默认 `qa:capability-gap-prd`）

- §1 公网招聘站（BE8 矩阵）
- §2 真模型 600s、Section H 人工文案
- §5 签名/notarization/200% 缩放
- Mailpit OTP 全链（可用 T3 + `cdp-mailpit-otp-login.mjs` 模拟邮件，仍非生产）

---

## 3. 建议新增：`qa:capability-gap-prd`（方案）

### 3.1 目标

一条命令覆盖 **Capability Gap PRD §1–§4** 中「能用模拟证明」的勾选项；输出 JSON manifest（pass/fail/skipped/manual）供 PM 工具导入。

### 3.2 建议实现（分 PR）

| PR | 内容 |
| --- | --- |
| **A** | 新增 `scripts/run-capability-gap-prd-gates.mjs`：串联 T0 文件列表（从本文 §5 表 `gate_files` 列聚合）+ 可选 `--with-t1`（browser-agent 子集） |
| **B** | 回迁 `local-qa-data/desktop-driver/cdp-*.mjs` → `scripts/qa/cdp/`（去密钥、只 fixture） |
| **C** | `scripts/qa/cdp-privacy-settings-smoke.mjs`：`desktop:driver launch` → 设置 → 打开导出/清设备/删号对话框 → **不提交删号** → screenshot；`eval` 断言 `data-testid` |
| **D** | `scripts/qa/cdp-privacy-export-dry-run.mjs`：mock 模式 — `eval` 调用 `window.coolto` 若暴露 test hook，或主进程 `COOLTO_QA_PRIVACY_EXPORT_FIXTURE=1` 写临时 zip（**需产品确认是否加 hook**） |
| **E** | App **analytics 客户端** + T2 回放：§3 勾选项才有端到端自动化 |

### 3.3 建议 `package.json` 脚本

```json
"qa:capability-gap-prd": "node scripts/run-capability-gap-prd-gates.mjs",
"qa:capability-gap-prd:ui": "node scripts/qa/cdp-privacy-settings-smoke.mjs"
```

### 3.4 运行顺序（本地）

```text
1. Docker API（仅 §3 BE / §4 云端路径）：见 .cursor-pm/DOCKER.md → cv-agent-be
2. npm run check                    # 全量回归（可选）
3. npm run qa:capability-gap-prd    # §1–§4 模拟矩阵
4. npm run qa:capability-gap-prd:ui # 可选 CDP UI smoke
```

---

## 4. §1–§4 对照矩阵（勾选项 × 自动化 × 缺口）

**图例 — 自动化层级**：`T0` 单测 | `T1` fixture QA | `T2` BE 隔离 DB | `T3` CDP Electron | `T4` 真环境/人工  
**图例 — 签字**：`✓` 模拟可覆盖 | `△` 部分 | `✗` 仍需人工或 T4

---

### §1 真实投递闭环 — §1.3

| # | PRD 勾选项 | App | BE | 自动化 | 已有门禁 | 缺口 |
|---|------------|-----|-----|--------|----------|------|
| 1 | 正式支持岗位来源与站点清单（产品可见） | 策略表 `recruiting-site-policy.ts` | — | T0 `site-policy-registry` | △ | **T3**：设置/帮助页文案与 registry 一致；无则 **✗ 产品稿** |
| 2 | 真账号公网全流程 | BE4 工具链 | sync | T1 `qa:browser-agent` | △ fixture | **T4** BE8；**✗** PRD 签字 |
| 3 | 简历版本冻结一致 | `application-write-proposal-service` | 存 snapshot | T0 submission tests | ✓ | **T3** 改稿中途拦截（可选脚本） |
| 4 | 登录/OTP/CAPTCHA/接管暂停恢复 | Harness + takeover tests | — | T0 `recruiting-takeover-recovery` | △ | **T4** 真 CAPTCHA；**T1** 可加深 fixture |
| 5 | 拒绝最终提交 → 无 submit、无 Application | approval 链 | — | T0 `application-submission` | ✓ | **T3** 浏览器 UI 点拒绝（fixture 站） |
| 6 | 成功 → 一条 Receipt + 一条 Application | 同上 | — | T0 | ✓ | **T3** 可选截图 |
| 7 | 不明/超时/崩溃后不重复提交 | receipt pending + prompt | — | T0 recovery + persistence-policy | ✓ | **T3** kill 进程（`desktop:driver quit` 模拟） |
| 8 | Tracker 失败只重放 sync | `sync_submission_receipt` | outbox | T0 recovery | △ | **T0** 需加 Outbox 故障注入用例 |
| 9 | 单页/多步/上传表单 | recruiting-form | — | T0/T1 | △ | **T4** 多样真实结构 |
| 10 | 失败有可理解原因 | 工具 failure 字段 | — | T1 部分 | △ | **T3** 任务 UI 文案快照 |

---

### §2 简历生成质量 — §2.3

| # | PRD 勾选项 | App | BE | 自动化 | 已有门禁 | 缺口 |
|---|------------|-----|-----|--------|----------|------|
| 1 | 四路径真账号完整样本 | workspace 路径 | 事实源 | T0 路径单测 | △ | **T4** L18/L20 样本库 |
| 2 | 600s 内明确终态 | 计时遥测 | — | T1 `run-resume-runtime-acceptance`（合成） | △ | **T4** 真模型；清单 **U** |
| 3 | 单页占用/尾行门槛 | 质量门单测 | — | T0 `resume-quality` 等 | △ | **T4** Section H 版面 |
| 4 | 数字可追溯 | evidence 链 | Experience | T0 batch/score | △ | 人工抽查表 **✗** |
| 5 | 「没有更多材料」不重复问 | readiness | — | T0 部分 | △ | **T3** 对话脚本（可 mock LLM） |
| 6 | 素材不足不包装可投递 | terminal-state | — | T0 | △ | **T3** |
| 7 | 通用简历无虚构 JD | source-snapshot | — | T0 | ✓ | — |
| 8 | user_directed 不偷换 | system-prompt + tools | — | T0 | ✓ | **T4** Agent 诱惑场景 |
| 9 | 历史复用重新验证 | workspace 策略 | Resume | T0 部分 | △ | **T4** 跨 JD 序列 |
| 10 | 产品/设计/非开发文字复核 | — | — | — | ✗ | **人工会议** |
| 11 | 预览/云端/PDF 同版本 | pdf-export tests | push | T0 + T1 runtime acceptance | △ | **T3** 三联 hash 对比 |
| 12 | 多次运行失败类型稳定 | 终态分类 | — | T0 部分 | △ | **T4** 3×N 统计 |

---

### §3 产品埋点 — §3.3

| # | PRD 勾选项 | App | BE | Admin | 自动化 | 已有门禁 | 缺口 |
|---|------------|-----|-----|-------|--------|----------|------|
| 1 | P0 事件字典签字 | **无客户端** | OpenAPI `analytics.yaml` | — | T2 契约 | handback 分支 | **App ingest SDK** + 产品签字 **✗** |
| 2 | 重建首启→首投递时间线 | 未上报 | `product_analytics_events` | — | T2 DB test | acceptance PASS | 无 App 事件则 **✗** |
| 3 | 三条漏斗报表 | — | compaction | Usage 切片 | T2/T3 Admin | fixture | Home/Growth **legacy** |
| 4 | 每步 phase 区分 | — | envelope.phase | — | T2 | duplicate_keys_test | App **✗** |
| 5 | 简历失败分类 | — | payload 扩展 | legacy | — | — | App **✗** |
| 6 | 浏览器按域名统计 | 本地 FillLog | metricFamily browser | — | — | — | 上报 **✗** |
| 7 | AgentTask 生命周期 | Harness 状态 | task family | — | T0 harness | — | 事件 **✗** |
| 8 | 去重不计两次成功 | — | `events.go` | — | T2 | ✓ | App 联调 |
| 9 | 离线补传 | — | 契约字段 | — | — | — | App outbox **✗** |
| 10 | 载荷无敏感正文 | 设计 | erasure/retention | BFF 无 token | T2 | ✓ BE | 端到端抽查 **△** |
| 11 | 核心指标可计算 | — | handoff | 2/4 页 D₁ | T2 | flag 默认关 | merge + live **✗** |

---

### §4 隐私导出/删除/同意 — §4.3

| # | PRD 勾选项 | App | BE | 自动化 | 已有门禁 | 缺口 |
|---|------------|-----|-----|--------|----------|------|
| 1 | 三入口独立 | `PrivacyDataSection.vue` | HTTP routes | T0 `privacy-ui-contract` | ✓ | **T3** 截图；prod 0.1.27 对齐 |
| 2 | 全量导出 | export IPC + tests | export_snapshot_service | T0 crypto/form | △ | **T2+T3** 全资产 zip 对账 |
| 3 | 导出与 UI 一致 | 映射单测 | snapshot | T0 | △ | 双账号 **T3** |
| 4 | 隔离环境恢复 | — | export 侧重 | — | ✗ | 导入产品范围待确认 |
| 5 | 清设备不误删云端 | `clearLocal` | — | T0 `privacy-local-clear` | ✓ | **T3** 重启回归 |
| 6 | 删号后不可登录 | deletion IPC | deletion_repository | T0 deletion-service | △ | **T2** 真 API 流程 |
| 7 | 删号中断态可见 | transport tests | — | T0 IPC | △ | **T3** 拔网线 |
| 8 | 同意含版本/时间 | privacy-service | consent 表 | T0 + coordinator | ✓ | **T3** 升级场景 |
| 9 | 重大升级重确认 | UI读 server policy | policy seed | T0 部分 | △ | **T3** mock major |
| 10 | 拒绝新版不继续处理 | auth-privacy-coordinator | middleware | T0 | △ | **T3** LLM 路径 |
| 11 | 文案与入口一致 | i18n catalog | — | T0 ui-contract | △ | **T3** 走查 |

---

## 5. 汇总：按端与 PRD 章

| 端 | §1 | §2 | §3 | §4 |
| --- | --- | --- | --- | --- |
| **App** | T0/T1 可证机制；真站 **T4** | T0 强；真模型/H **T4/人工** | **缺上报** → 自动化断层 | T0 强；E2E **T3 待补** |
| **BE** | 仅 Application 事实 | 存证 | D₁ **分支** + T2 | privacy T2（handback/target_prd） |
| **Admin** | — | — | Usage/Pipeline 切片；漏斗 **未闭环** | — |

**默认模拟门禁可勾选的 PRD 项（约）**：§1 #5–#7；§2 #7–#8；§4 #1/#5/#8（T0）；加上 §1 DEL、§4 PRI 整包 `qa:phase-4-c3`。

**不能靠模拟代替 PRD 签字的项**：§1 #2/#4/#9 真站；§2 #2/#10；§3 全链直到 App 上报；§4 #4/#6–#7 部分；§5（PRD 未展开但依赖 T4）。

---

## 6. 与仓库其他文档的关系

| 文档 | 关系 |
| --- | --- |
| `local-docs/p0-product-completion-roadmap/README.md` | BE7/BE8、S4.5 H、S5 — 全产品链，在串行 PRD 之后 |
| `.cursor-pm/PROGRAM.md` | Phase 3–5 工程状态 |
| `prd-app-manual-electron-acceptance-2026-09-13.md` | T3 历史 PASS 索引 |
| `phase-4-manual-test-checklist.md` | 仍 **U** 项 = T4 或待写 T3 脚本 |
| `phase-5-gap-13-pages.md` | §3 Admin 缺口 |

---

## 7. 附录：`qa:phase-4-c3` 与 Capability Gap 映射

| C3 Tier ID | Capability Gap 章 |
| --- | --- |
| DEL | §1 |
| RES + SCORE | §2 |
| ANA | §3（仅 App 传输/偏好侧；非完整漏斗） |
| PRI | §4 |
| PLAT | §5（PRD 第 5 章，本文未展开表） |
| SIGNOFF | §1/§4 同步边界 |

---

## 8. 变更记录

| 日期 | 说明 |
| --- | --- |
| 2026-09-17 | 初版：自动化方案 + §1–§4 矩阵；实测 driver stale session + submission 单测 13 PASS |
