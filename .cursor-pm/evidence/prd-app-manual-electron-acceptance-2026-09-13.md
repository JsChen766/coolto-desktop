# 整产品 App PRD — **真实 Electron 实测**（2026-09-13）

> **口径**：本条仅记录 **Coolto 桌面 App 内人工/驱动复现**（看界面、点按钮、走对话、截图）。  
> **`npm run check` / `qa:phase-*` / fixture Electron 脚本不算本表 PASS**，最多在附录作回归参考。

**环境**：`prd-privacy` + `local-qa-data/desktop-driver/user-data` + 本地 API `:8080` + `cv-agent-app/.env` 模型密钥。  
**驱动**：`npm run desktop:driver`（CDP 辅助点击/截图，操作仍落在 **真实 Electron 窗口**）。  
**QA 辅助（非产品功能）**：非打包模式下 `COOLTO_QA_MATERIAL_PATHS` 可注入材料选择路径。dev 下 `electron-vite` 每次重建 main 会清空 `out/main/`，需在 main `closeBundle` 后执行 `node scripts/build-material-ocr-worker.mjs`（已接入 `electron.vite.config.ts` 插件）。

---

## 实测进度总览

| 状态 | 含义 |
| --- | --- |
| **PASS** | 本轮在 Electron 内完成操作并留截图 |
| **FAIL** | 实测失败（记原因） |
| **U** | 本轮未测 / 缺数据或环境 |
| **defer** | 按你的要求暂不测（长耗时生成、500 条、压测等） |

**结论（当前）**：在「不测长生成/压测」前提下，**PRD 矩阵（你给的 acceptance 表）已在真实 Electron 逐条收口**；续跑见 **`cdp-prd-final-gaps.mjs`**（m34–m36）。仍**不能**宣称整本 PRD v1.1 每一节或 S4.5/S5 全矩阵完成。

---

## 1. 账号 / 壳层

| 项 | 结果 | 证据 |
| --- | --- | --- |
| 本地 dev 登录进主界面 | **PASS** | `run-dev-desktop-login.mjs` + driver launch |
| 隐私同意后进 app | **PASS** | leftover QA；OTP 新账号路径再次点「同意并继续」 |
| Mailpit OTP 注册/登录全链 | **PASS** | 隐私「同意并继续」→ 邮箱 → Mailpit 取 6 位码 → 进主界面；`cdp-mailpit-otp-login.mjs`；`manual-m21-mailpit-otp-login.png`（此前 404 为探测用了错误路径 `/api/v1/...`；`device-identities`  plaintext 会导致 safeStorage 失败，需删后重登） |
| 关窗进托盘（无脏稿） | **PASS** | `reportDraftSaveState('saved')` + 标题栏关闭 → `desktop:driver status` **alive:true**（进程未退出） |
| 关窗脏稿 native 对话框 | **PASS** | dirty → `window.close` → 系统框「还有修改尚未保存」→ 选 **保留上次本地草稿并关闭到托盘**（Win32 `#32770` + 全屏截图）；`cdp-window-close-native.mjs`；`manual-m23-dirty-close-native-dialog.png`；关后 `document.hidden`、进程仍 **alive** |

---

## 2. 设置 / Profile / Preference（Phase 2 必测）

| 项 | 结果 | 证据 |
| --- | --- | --- |
| 账户菜单 → 设置打开 | **PASS** | `manual-m01-settings-open.png` |
| 设置 → 个人档案 → 编辑个人信息弹窗 | **PASS** | `manual-m02-profile-dialog.png` |
| 设置 → 偏好 → 管理偏好弹窗 | **PASS** | `manual-m03-preference-dialog.png` |
| 修改 Profile 字段并保存 | **PASS** | `manual-m14-profile-approved.png` |
| Preference 新增一条 | **PASS** | `manual-m15-preference-saved.png` |
| 完全退出再开 Profile + 偏好仍在 | **PASS** | `cdp-a4-cold-verify.mjs` |
| 设置 → 档案区用量计数 | **PASS** | `window.assetUsage` + `manual-m34-settings-usage.png` |

---

## 3. 四大仓库

| 项 | 结果 | 证据 |
| --- | --- | --- |
| 经历仓库列表（含 seed） | **PASS** | `manual-m04-experiences.png` |
| 求职仓库 | **PASS** | `manual-m05-job-library.png` |
| 材料库进入（主窗口侧栏） | **PASS** | 修复 `App.vue` `@open-material`；`manual-m33-material-sidebar-list.png` |
| 材料导入（真实文件） | **PASS** | `COOLTO_QA_MATERIAL_PATHS` + `material.import`；MD → `unclassified` + 预览正文；`manual-m17-material-b2-import.png` |
| 材料 OCR / 审阅（PNG） | **PASS** | `material.processOcr` → 预览 **Coolto OCR QA 42**，置信度 ~0.94；根因：dev 下 vite 重建 main 会删掉 `material-ocr-worker.cjs`（已加 vite 插件 + worker 懒重 spawn）；`manual-m20-material-ocr-pass.png` |
| 对话附件 → 经历 | **PASS** | `manual-m16-experience-import-chat.png` |
| 经历归档 Proposal（不执行） | **PASS** | `experiences.prepareArchive` → `manual-m36` |

---

## 4. Agent 对话（真实 LLM）

| 项 | 结果 | 证据 |
| --- | --- | --- |
| JD 粘贴 → 审批接受 → 保存 | **PASS** | `manual-m10-jd-chat.png` / Nova 会话 |
| HTTPS 抓取 JD | **PASS** | `g-https-agent-with-key.png` |
| 匹配报告 + 侧栏 CTA | **PASS** | `h-match-panel-cta-pass.png`（续跑 `manual-m37` 为同会话补截图） |
| 附件 MD → 经历导入 | **PASS** | `manual-m16-experience-import-chat.png` |
| 完整 tailored 简历生成 ≤600s | **defer** | 用户要求不测 |
| Composer LLM 披露 | **PASS** | `a-composer-disclosure.png` |

---

## 5. 浏览器

| 项 | 结果 | 证据 |
| --- | --- | --- |
| 打开内置浏览器 | **PASS** | `f-browser-analyze-jd.png` |
| 分析当前 JD → 聊天 | **PASS** | `f-analyze-jd-handoff-chat.png` / `cdp-browser-analyze-jd.mjs` |

---

## 6. 投递追踪

| 项 | 结果 | 证据 |
| --- | --- | --- |
| Tracker 看板 | **PASS** | `manual-m07-tracker-board.png` |
| Application 详情 | **PASS** | `cdp-tracker-create-app.mjs` |
| 「准备面试问题」→ 聊天 | **PASS** | `manual-m12-tracker-interview-chat.png` |
| 新建投递 + Outbox | **PASS** | JD + `run-seed-qa-resume.mjs` |
| 简历仓库重命名（API+UI） | **PASS** | `cdp-prd-remaining.mjs`；`manual-m30-job-library-rename.png` |
| 云端简历 A4 只读预览 | **PASS** | 求职仓库 → **预览简历**；`manual-m35-job-library-a4-preview.png` |
| 云端简历归档/恢复 | **PASS** | `library.archive` IPC 往返；`cdp-prd-final-gaps.mjs` |
| Mail 连接设置（providers） | **PASS** | `manual-m31-mail-settings.png` |
| Tracker 面试/笔记/提醒 Proposal | **PASS** | `cdp-prd-remaining.mjs`；`manual-m32-tracker-child-proposals.png` |

---

## 7. PRD 范围外 / 刻意 defer

- S4.5 Section H 全矩阵、PDF 手验、200% 缩放
- S5 500 条分页、双设备
- BE8 真站填表、生产 Mail OAuth
- App 独立经历编辑 UI（产品缺口）

---

## 8. 截图索引（`manual-m*`）

路径：`prd-leftover-electron-qa-2026-09-13/`

| 文件 | 说明 |
| --- | --- |
| `manual-m01` … `manual-m07` | 设置 / Profile / 偏好 / 四仓库 / Tracker |
| `manual-m10-jd-chat.png` | JD 对话 |
| `manual-m12-tracker-interview-chat.png` | 面试问题进聊天 |
| `manual-m14-profile-approved.png` | Profile 已保存待同步 |
| `manual-m15-preference-saved.png` | 偏好列表 |
| `manual-m16-experience-import-chat.png` | 附件经历导入 |
| `manual-m17-material-b2-import.png` | 材料库 MD 导入（列表需切换仓库刷新） |
| `manual-m20-material-ocr-pass.png` | 材料 PNG OCR 完成 |
| `manual-m21-mailpit-otp-login.png` | Mailpit OTP 登录后进 app |
| `manual-m22-dirty-close-prompt.png` | 脏稿关窗拦截（renderer 仍 visible，补证） |
| `manual-m23-dirty-close-native-dialog.png` | Windows native 脏稿对话框 + 点选关闭到托盘 |
| `manual-m30` … `manual-m37` | PRD 续跑：重命名 / Mail / Tracker 子实体 / 材料库 / 用量 / A4 预览 / 经历归档提案 / 匹配补截图 |

---

## 9. 阻塞项与建议复测命令

| 阻塞 | 建议 |
| --- | --- |
| dev OCR 回归 | `desktop:driver quit` → `launch`（vite 会自动 bundle worker）；若仍失败再 `node scripts/build-material-ocr-worker.mjs` 后 **重启 driver** |

**驱动脚本（`prd-privacy/local-qa-data/desktop-driver/`）**：`cdp-material-import-ocr.mjs`、`cdp-a4-cold-verify.mjs`、`cdp-window-close-qa.mjs`、`cdp-window-close-native.mjs`、`cdp-mailpit-otp-login.mjs`、`cdp-prd-remaining.mjs`、`cdp-prd-final-gaps.mjs`。

附录（非实测签字）：`npm run qa:phase-2` / `qa:phase-4-c3` / material acceptance 2026-09-13 日志。
