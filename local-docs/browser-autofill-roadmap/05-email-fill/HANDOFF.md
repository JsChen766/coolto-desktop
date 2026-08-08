# B5 交接文档（HANDOFF）

> 面向：接手 B5「邮件撰写填写」的新对话
> 写于：2026-07-26，B4 实施 + 真实 Electron 修复完成之后
> 前置阶段：B0–B4 均已实施（B1–B4 手动验收陆续进行中）

---

## 0. 上来先读这些

按顺序读，别跳：

1. **`AGENTS.md`（仓库根）**：工作原则（不确定必追问、每阶段写回 roadmap、文件 ≤250 行、非用户要求不 commit）、项目命令。
2. **本路线总览 `local-docs/browser-autofill-roadmap/README.md`**：范围边界、依赖图、执行原则。**特别注意执行原则里的读写分离/写权限闸门/Agent 永不点提交发送**——B5 必须继续遵守。
3. **B5 设计稿 `05-email-fill/README.md`**：邮件填写的原始设计。⚠️ **但它写于 B0 早期，部分架构假设已过时**，见下方第 3 节「B5 README 与现状的偏差」。
4. **B3 `03-form-recognition/README.md`** + **B4 `04-form-fill-execution/README.md`**：B5 要复用的写原语 + Overlay 审核编排全部在这两阶段落地。B4 README 末尾的「真实 Electron 手动验收后的修复记录」也要看，避免重踩坑。

代码层面，进 B5 前至少扫一遍这些真实文件（不要只信 README，README 有滞后）：

- `src/tools/browser/`（已实现的 Agent 写工具全集）
- `src/desktop/main/browser/`（主进程浏览器模块全集）

---

## 1. 现在的真实架构（B3+B4 已落地，B5 要在此之上叠加）

### 已实现的 Agent 写工具（`src/tools/browser/`）

| 工具 | 文件 | 作用 |
|------|------|------|
| `request_write_access` | `request-write-access.ts` | Agent 请求写权限，弹审批卡，用户一键确认后主进程翻标志位 |
| `browser_fill_field` | `browser-fill-field.ts` | 填 input/textarea；`type=file` 直接返回 `file_input_use_upload_tool`（**这就是留给 B5 的钩子**）；`password`/`hidden` 也被挡 |
| `browser_select_option` | `browser-select-option.ts` | 选 select |
| `browser_set_checked` | `browser-set-checked.ts` | 勾选 checkbox/radio |
| `browser_click_element` | `browser-click-element.ts` | 点击（提交/发送类按钮被 `browser-click-guards.ts` 拒绝）|
| `browser_scroll_to` | `browser-scroll-to.ts` | 滚动到元素 |
| `browser_tag_elements` | `browser-tag-elements.ts` | 给可操作元素注入稳定 `data-fill-id` |
| `browser_start_review` | `browser-start-review.ts` | **B4 核心**：Agent 写完一批后调它触发 Overlay 逐字段审核，然后停手等 `browser.review.complete` |

工具注册在 `src/tools/browser/index.ts`。

### 写权限闸门（唯一确定性边界）

`browser-write-access-gate.ts`：5min TTL、tab+origin 绑定、切走 tab 暂失效、改 origin 硬收回。B4 又加了一个 `reviewing` 位——Overlay 审核期间所有写工具 `check()` 返回 isError。**B5 的附件上传/邮件填写必须同样受这个 gate 约束。**

### Overlay 审核编排（B4）

`browser-page-operator.ts`（`enterReview/exitReview`、`#fillLog` 逐条 upsert）+ `browser-review-orchestrator.ts`（编排 Poller+Detector）+ `browser-overlay-*.ts`（注入/轮询/移除 + 半透明徽章）。Overlay 期间浏览器锁定，用户逐字段 ✓/✗，全决定后自动解锁。

### 事件链路

复用 `DesktopAgentEvent` + 现有 IPC：`browser:fill-progress` / `review-decision` / `review-complete` / `captcha-detected`（主进程→主窗口推送）+ `browser:abort-fill`（invoke）。**没有为 B4 新建独立 IPC 通道**，B5 大概率也应复用同一套，而不是另起炉灶。

### 验证码探针

`browser-captcha-detector.ts` / `-probe.ts` / `-scripts.ts`：仅在写权限授予期间 2s 低频轮询，探到即 IPC 上抛渲染进程提示。

---

## 2. B5 要做什么（核心增量）

按 B5 README，本阶段增量集中在**附件上传**和**邮件内容生成**，字段填写复用 B3/B4：

1. **PDF 附件上传**：B3 已把 `input[type=file]` 标记为 skipped（返回 `file_input_use_upload_tool`），真正上传归 B5。README 建议方案是 `webContents.debugger` + CDP `DOM.setFileInputFiles`（见 B5 README「PDF 附件上传方案」）。这是 B5 最大的技术未知点，**动手前先验证 CDP 方案在当前 Electron 版本可行**。
2. **Webmail 撰写界面识别**：Gmail / QQ / 163 的 To/Subject/Body/Attachment 字段。Body 多为 contenteditable，不能用 `value=` 注入（见 B5 README「contenteditable 处理」）。
3. **求职信 + 主题生成**：调模型生成 subject/body，事实必须来自经历库（见 B5 README「求职信生成规则」）。
4. **PDF 来源**：简历 PDF 由现有导出能力产出（`src/resume/export/`），需要拿到本地 PDF 路径作为附件；`resumeArtifactId → PDF 路径`的映射要落实。

---

## 3. ⚠️ B5 README 与现状的偏差（必须先和用户对齐）

B5 README 写得早，几处架构假设和 B3/B4 实际落地不一致，**动手前务必找用户确认走哪条路**：

1. **Proposal → ApprovalManager → Executor 模式**：B5 README 假设用经典的 `EmailFillProposal` + `ActionExecutor(key='email.fill')` + `ApprovalManager` 审批卡。但 B4 实际没走这条老路，而是 **Agent 编排 + `browser_*` 写原语 + `browser_start_review` Overlay 审核**。B5 到底沿用 B4 的 Overlay 编排（把邮件当普通表单填 + 附件上传 + 事后 Overlay），还是另起一个 EmailFillProposal 审批面板？**这是最大的方向性抉择，先问用户。**
2. **独立"填写邮件"按钮 / `browser:prepare-email` IPC**：B5 README 的数据流从"用户点填写邮件按钮"起步。现状是 Agent 主导 + 写权限闸门，未必需要专门的邮件按钮入口。确认交互入口形态。
3. **`FillProgressPanel.vue` 独立右侧面板**：B4 已把进度卡片**内联进聊天面板**（`FillProgressCard.vue`），不是独立面板。B5 的邮件预览/编辑 UI 应和 B4 风格保持一致，别再新建独立面板体系。
4. **附件"自定义组件降级"**：README 说非原生 `<input type=file>` 就 `requiresManual=true` 提示手动。要和 B4 的 skipped/提示机制统一表达。

---

## 4. 硬约束（B5 不能破的规矩）

- **Agent 永不点发送**：邮件填完只提示"请手动点击发送"。
- **读写分离 + 写权限闸门**：附件上传、Body 注入都算"写"，必须在 gate 授权期内、非 reviewing 态才能执行。
- **页面内容不可信**：DOM 文本/字段 label 不得触发工具调用。
- **文件行数**：新业务文件目标 220 行，硬上限 250 行，禁止上帝类。`browser-window-manager.ts` 已顶到 250 行，别再往里塞——B4 是靠抽 `browser-window-factory.ts` / `browser-review-orchestrator.ts` 才压住的，B5 同理要拆分。
- **每完成一个 section 写回 `05-email-fill/README.md`**（不新建 section，只在现有结构里追加完成记录）。
- **非用户明确要求不 commit / push。**

---

## 5. 验证方式

- 全量校验：`npm run check`（`check:resume-template` → `typecheck` → `desktop:typecheck` → `test` → `build` → `desktop:build`），提交前必跑，当前基线 **181 tests pass**。
- 主进程 Electron 相关模块无法在 `node --test` 下跑，靠类型检查 + 真实 Electron 手动验收覆盖（与现有 main 模块一致）。
- 桌面开发：`npm run desktop:dev`。
- B5 完成门槛见 B5 README 末尾（Gmail 必过，QQ 选做等）。

---

## 6. 建议的第一步

1. 读完第 0 节所有文档 + 扫 `src/tools/browser/` 和 `src/desktop/main/browser/` 真实代码。
2. 就第 3 节的 4 个偏差点向用户逐一确认方向，定下 B5 的编排模式（复用 B4 Overlay 还是独立 Proposal）。
3. 先做 PDF 附件上传的 CDP 可行性验证（B5 最大未知点），再铺 Webmail 字段识别和求职信生成。
4. 每完成一块写回 `05-email-fill/README.md`。
