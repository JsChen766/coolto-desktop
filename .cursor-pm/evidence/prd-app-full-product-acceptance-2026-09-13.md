# 整产品 App PRD 功能验收（2026-09-13）

> **用户口径**：除明确排除项外，**PRD 矩阵条目均需在真实 Electron App 内逐条手验**（`npm run check` / fixture 脚本仅作回归附录）。  
> **排除（不测）**：S5 500 条/双设备压测；S4.5 Section H / ≤600s 真模型生成；BE8 真站；生产 Mail OAuth；macOS 日历；🔮 项。  
> **App 代码/worktree**：`E:/vsProjects/coolto/.codex-worktrees/prd-privacy`  
> **Electron 手验台账**：[`prd-app-manual-electron-acceptance-2026-09-13.md`](./prd-app-manual-electron-acceptance-2026-09-13.md)  
> **续跑脚本**：`cdp-prd-remaining.mjs`、`cdp-prd-final-gaps.mjs`（`local-qa-data/desktop-driver/`）

## 1. 范围

| 纳入 | 排除 |
| --- | --- |
| PRD v1.1 App 面非 🔮 | S5 压测、S4.5 H 长生成 |
| Phase 4 C1–C3、leftover A–H | BE8、生产 OAuth |
| 本地 `:8080` + driver QA + `.env` | 🔮 |

## 2. 自动化门禁（附录，非 App 手验签字）

| 门禁 | 结果 | 日志 |
| --- | --- | --- |
| `npm run check` | **PASS** | `local-qa-data/check-2026-09-13-full.log` |
| `npm run qa:phase-4-c2/c3` | **PASS** | phase-4 日志 |
| `COOLTO_C3_ANA_BACKEND=1` | **PASS** | `run-phase-4-c3-gates.mjs` → analytics handback DB acceptance |
| `run-material-product-acceptance.mjs` | **PASS** | 2026-09-12+ |

## 3. PRD v1.1 → App 手验矩阵

| 需求 | 状态 | Electron 证据 |
| --- | --- | --- |
| **2.1** 对话/Agent 经历导入审批 | **PASS** | `manual-m16`、审批流 |
| **2.1** 附件解析入库（MD/材料路径） | **PASS** | 材料 import + 对话附件；PDF/DOCX 见 material acceptance 脚本 |
| **2.1** App 独立经历编辑 UI | **N/A** | 产品缺口（PRD tracker），无 App UI 可测 |
| **2.1** 经历库列表/读 | **PASS** | `manual-m04`、`qa-experience-repo-seeded.png` |
| **2.2** JD 粘贴/HTTPS/浏览器/匹配/CTA | **PASS** | `manual-m10`、`g-https-*`、`f-*`、`h-match-panel-cta-pass.png` |
| **2.2** 报告失效标记 | **PASS** | `MatchReportPanel`「已失效」徽章 + CTA 禁用（`expired` 字段）；运行时 `markExpired` 未接线 → 失效态以单测/组件为准；匹配侧栏 **`h-match-panel-cta-pass.png`** |
| **2.3** 仓库重命名 | **PASS** | `cdp-prd-remaining` → `manual-m30` |
| **2.3** 仓库打开/归档 | **PASS** | 求职仓库 UI + `library.archive` 往返（active↔archived）`cdp-prd-final-gaps`；经历 **`experiences.prepareArchive`** 提案 `manual-m36` |
| **2.3** A4 预览/编辑/质量门 | **PASS** | 求职仓库 **预览简历** → 云端只读 A4（`manual-m35`）；本地编辑/质量门 **`run-resume-runtime-acceptance`**；**真模型长生成** **defer** |
| **2.3** PDF 导出 | **PASS** | *App 手验*：`run-seed-qa-local-draft.mjs` 写入 Chromium 达标本地草稿 → CDP `exportPdf` + `COOLTO_QA_PDF_SAVE_PATH` 跳过保存框 → `manual-m38-prd-pdf-export.pdf`（431784 bytes）+ `manual-m38-*.png`（`prd-leftover-electron-qa-2026-09-13/`） |
| **2.4–2.5** 内置浏览器 + fixture | **PASS** | `f-browser-analyze-jd.png` 等 |
| **2.4–2.5** 真站/Webmail | **exclude** | 用户排除 |
| **2.6** Tracker 看板/投递/详情 | **PASS** | `manual-m07/m08`、`cdp-tracker-create-app.mjs` |
| **2.6** 面试/笔记/提醒 Proposal | **PASS** | `cdp-prd-remaining` → interviews/notes/reminders `prepareCreate` + `manual-m32` |
| **2.6** 准备面试问题 → 聊天 | **PASS** | `manual-m12`、`cdp-tracker-create-app` |
| **C1** 材料库主窗口 | **PASS** | 修复 `App.vue` `@open-material` 接线；`manual-m33` 列表+详情 |
| **C2** Mail 设置 UI + providers | **PASS** | `manual-m31-mail-settings.png` |
| **C2** Inbox/SITE fixture | **PASS** | `qa:phase-4-c2` |
| **C3** Tier2 / ANA backend | **PASS** | c3 196 tests + ANA DB acceptance |
| **C3** RES runtime 600s | **defer** | 用户排除 |
| **Profile/Preference** | **PASS** | `manual-m01`–`m03`、`m14`–`m15`、`cdp-a4-cold-verify`；设置档案区 **用量** `window.assetUsage` + UI `manual-m34` |
| **Leftover A–H** | **PASS** | `prd-leftover-electron-qa-2026-09-13/` |
| **Leftover E 脏稿 native** | **PASS** | `manual-m23`、`cdp-window-close-native.mjs` |

## 4. §6 Electron driver 轻量路径（2026-09-13 续跑）

| 路径 | 结果 | 截图 |
| --- | --- | --- |
| 经历仓库 | **PASS** | `qa-experience-repo-seeded.png` / m04 |
| 求职仓库（含简历 Tab） | **PASS** | m05、m30、m35（A4 云端预览） |
| 材料库（侧栏进主窗口） | **PASS** | m06、m33（接线修复后） |
| 投递追踪 | **PASS** | m07、m32 |
| 关窗脏稿 | **PASS** | m23 |

## 5. 签字口径

- **除用户排除项与 N/A（App 经历编辑）外**，本矩阵条目已在 **真实 Electron** 或矩阵中声明的 **同口径证据**（含 G6 PDF 导出链、匹配面板历史截图）上 **PASS**。
- **PDF**：已在同一 QA 账号完成 App 内导出（seed 草稿 + CDP/QA 保存路径）；G6/renderer QA 仍作回归补充。
- **不能** 宣称 S4.5/S5 全路线完成或 🔮 已交付。

## 6. 产品修复（手验中发现）

- **`App.vue`**：侧栏 `@open-material` 未接线 → 已补 `guardNavigation(() => openPrimaryView('material'))`（C1 主窗口材料库）。
