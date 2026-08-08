# B5：邮件撰写填写

> 状态：待实施  
> 前置：B4 表单填写执行完成（复用其字段注入基础设施）

## 目标

当用户在浏览器中打开 Webmail 的邮件撰写界面时，Agent 生成求职信内容、邮件主题行，并自动填入撰写表单，同时上传简历 PDF 作为附件。用户 review 后手动点击发送。

复用 B4 的字段注入机制，差异仅在于内容来源（求职信文本 vs 结构化个人信息）和附件上传逻辑。

---

## 核心产物

### 主进程（`src/desktop/main/browser/`）

| 文件 | 职责 |
|------|------|
| `browser-webmail-scanner.ts` | 针对 Gmail / QQ / 163 撰写界面的字段识别规则（To/Subject/Body/Attachment input）；复用 browser-form-scanner 的 executeJavaScript 机制 |
| `browser-file-uploader.ts` | 通过 `webContents.debugger`（Chrome DevTools Protocol）触发文件 input 的文件选择，将本地 PDF 路径注入附件字段；或通过 `webContents.session.on('will-download')` 拦截下载后重路由 |
| `browser-email-executor.ts` | `ActionExecutor` 实现，键 `email.fill`：调用 B4 的 `browser-field-injector` 填入 Subject/Body/To；调用 `browser-file-uploader` 上传 PDF；推送进度 |

### Agent 工具（`src/tools/`）

| 文件 | 职责 |
|------|------|
| `prepare-email-fill.ts` | 工具 `prepare_email_fill`：接收 `jdId`、`resumeArtifactId`（用于找 PDF）、`recipientEmail?`（用户提供）；调用模型生成 `subject`（邮件主题）和 `body`（求职信正文）；创建 `EmailFillProposal`；通过 `ApprovalManager` 发出审批 |

### 共享类型（`src/desktop/shared/types.ts`）

```typescript
interface EmailFillProposal {
  proposalId: string;
  recipientEmail: string;
  subject: string;
  body: string;                   // 求职信正文（Markdown，注入时转纯文本）
  attachmentPath: string;         // 本地 PDF 文件路径
  attachmentFilename: string;     // 展示给用户的文件名
  jdId: string;
  resumeArtifactId: string;
  createdAt: string;
}
```

### Renderer（`src/desktop/renderer/src/`）

| 文件 | 职责 |
|------|------|
| `components/EmailFillProposalCard.vue` | 聊天流卡片：显示收件人/主题/附件名；点击展开 EmailFillProposalPanel |
| `components/EmailFillProposalPanel.vue` | 右侧面板：可编辑的收件人/主题；富文本预览（只读）求职信正文（用户可要求 Agent 重新生成）；附件文件名；「确认并开始填写」按钮 |

---

## Webmail 支持矩阵

| 网站 | 撰写界面识别方式 | To 字段 | Subject 字段 | Body 字段 | 附件 |
|------|---------------|---------|-------------|----------|------|
| Gmail (`mail.google.com`) | URL 含 `compose` 或 DOM 含 `[aria-label="To"]` | `[aria-label="To"]` input | `[aria-label="Subject"]` input | `[aria-label="Message Body"]` div（contenteditable） | file input button |
| QQ 邮箱 (`mail.qq.com`) | URL path 含 `/compose` | `#toaddr` | `#subject` | `#contentEditableDiv`（contenteditable） | `#att_upload` |
| 163 邮箱 (`mail.163.com`) | URL hash 含 `compose` | `.compose-to` | `.compose-subject` | `.compose-body`（contenteditable） | 附件按钮 |

**contenteditable 处理：**
- contenteditable body 不能用 `value =` 注入，使用 `innerHTML = ` 或 `document.execCommand('insertText')`
- 注入前先 focus，注入后触发 input 事件

---

## 求职信生成规则

`prepare_email_fill` 调用模型时的内容要求：

| 内容项 | 要求 |
|--------|------|
| 邮件主题 | 格式：`[姓名] - 应聘[岗位名称] - [公司名]`；如无公司名则省略 |
| 求职信正文 | 3–4 段：自我介绍 → 与 JD 的契合点（引用亮点匹配结果）→ 表达意愿 → 礼貌结尾 |
| 字数 | 正文 300–500 字；不超过一页 |
| 事实要求 | 所有经历引用必须来自用户经历库；不捏造技能或成果 |
| 口吻 | 正式但不死板；第一人称 |

若当前对话中已有 MatchReport（当前 JD 的），优先将亮点匹配段落作为求职信契合点的素材。

---

## PDF 附件上传方案

Electron 提供 `webContents.debugger` API，可通过 Chrome DevTools Protocol 设置文件 input 的值：

```javascript
// 主进程（Node.js 端）
await browserWindow.webContents.debugger.attach('1.3');
await browserWindow.webContents.debugger.sendCommand('DOM.setFileInputFiles', {
  objectId: fileInputObjectId,  // 通过 Runtime.evaluate 获取
  files: ['/path/to/resume.pdf']
});
```

若目标网站的附件按钮不是原生 `<input type="file">` 而是自定义组件，则标记附件字段为 `requiresManual=true`，在面板提示用户手动上传。

---

## 数据流

```text
用户在 Gmail 撰写界面点击「填写邮件」
  └─ browser:prepare-email IPC → 主进程
       └─ Agent 调用 prepare_email_fill(jdId, resumeArtifactId)
            └─ 模型生成 subject + body
                 └─ 创建 EmailFillProposal → EmailFillProposalCard
                      └─ 用户在 Panel 审阅（可修改主题/正文/收件人）
                           └─ 确认 → EmailFillExecutor 执行
                                ├─ 填入 To（若有）
                                ├─ 填入 Subject
                                ├─ 填入 Body（contenteditable）
                                └─ 上传 PDF 附件
                                     └─ 完成 → 提示「请手动点击发送」
```

---

## 本阶段不做

- SMTP / Gmail API 草稿写入（不做，仅 Webmail 网页填写）
- Outlook Webmail（后续按需追加）
- 邮件模板管理（用户保存/复用求职信模板）
- 自动检测收件人邮箱（HR 邮箱通常在 JD 中，提取逻辑后续增强）

---

## 完成门槛

- 在 Gmail 撰写界面完成填写：Subject/Body 正确填入，PDF 附件出现在附件区
- EmailFillProposalPanel 显示可编辑的主题和正文预览
- 用户修改正文后点击「确认」，更新后的内容被填入
- `body` 注入后 Gmail 的「发送」按钮可点击（表单合法）
- QQ 邮箱完成相同流程（选做，至少 Gmail 必须通过）
- `npm run check` 通过；新文件均在 250 行以内

---

## 完成记录

### 方向决策（2026-07-26，与用户确认）

B5 README 早于 B3/B4 落地，几处架构假设已过时。经与用户确认，B5 走以下方向（不走本文档上半部分的 `EmailFillProposal + ApprovalManager + email.fill Executor` 老路）：

1. **编排**：沿用 B4 的 Overlay 编排（Agent + `browser_*` 写原语 + `browser_start_review`），不引入 `EmailFillProposal` / `ApprovalManager` / 独立右侧面板。与总览"不分模式"原则一致。
2. **内容生成**：Agent 直接在对话中基于经历库 / MatchReport 生成 subject + body，不新建 `prepare_email_fill` 工具。
3. **附件来源**：用户手动选 PDF（主进程弹系统文件选择框拿路径），Agent 不指定任意本地路径；不改动 `src/resume/export/`，不做 `resumeArtifactId → 路径`映射。
4. **顺序**：先做 PDF 附件上传的 CDP 可行性验证，再铺 contenteditable 正文与 Webmail 字段识别。

### 第一批：PDF 附件上传（CDP）— ✅ 已实施并手动验收通过

**核心结论**：Electron 43.2.0 + `WebContentsView`（sandbox）下，`webContents.debugger` + CDP `DOM.setFileInputFiles` 方案可行，可正常向原生 `<input type=file>` 注入本地文件路径并触发 change 事件。

**文件清单**

| 文件 | 行数 | 说明 |
|------|------|------|
| `src/desktop/main/browser/browser-file-uploader.ts` | ~185 | CDP 上传核心：`setFileInputFiles`（attach 1.3 → Runtime.evaluate 取 objectId → DOM.setFileInputFiles → 派发 input/change → detach）+ `probeFileInput`（executeJavaScript 读 accept/multiple/合法性）+ `pickLocalFiles`（系统文件框）+ `buildFileFilters`（accept → dialog filters） |
| `src/tools/browser/browser-upload-file.ts` | ~70 | Agent 工具 `browser_upload_file`：受写权限闸门约束；用户取消返回提示而非错误；非原生 file input 返回 isError 提示手动上传 |

**改动的既有文件**

- `src/browser/types.ts`：`BrowserPageOperator.uploadFile(fillId)` + `FileUploadOutcome`（`cancelled` | `{filenames, fileCount}`）。
- `src/desktop/main/browser/browser-page-operator.ts`：实现 `uploadFile`（probe → 弹框 → CDP 注入，touch 刷新 TTL），新增 `FilePicker` 依赖。
- `src/desktop/main/browser/browser-window-manager.ts`：注入 `FilePicker`（Electron `dialog.showOpenDialog`，父窗口为浏览器窗口）。
- `src/tools/browser/index.ts`：注册 `browser_upload_file`。

**安全边界**：附件上传属"写"操作，与其他写原语一样受 `browser-write-access-gate` 约束（TTL / tab+origin 绑定 / reviewing 期禁用）；Agent 无法指定任意本地路径，只能触发系统文件框由用户手动选取。

**手动验收结果（2026-07-26，真实 Electron）**：验收页 `05-email-fill/upload-test.html`，5 个场景全部符合预期：
1. 单文件（accept=".pdf"）→ ✅ 成功注入并触发 change
2. 多文件（multiple）→ ✅ 成功注入 2 个 .docx
3. 无 accept 限制 → ✅ 成功注入 .zip
4. 禁用状态 → ✅ 正确拒绝（element_disabled）
5. 普通文本框 → ✅ 正确拒绝并提示手动上传

**待办（后续批次）**：
- contenteditable 正文写原语（Gmail/QQ/163 Body 是 contenteditable，`browser_fill_field` 仅认 INPUT/TEXTAREA）。
- Webmail 字段识别与求职信生成的全链路（复用 tag + fill + upload + start_review）。

### 第二批：contenteditable 富文本正文 — ✅ 已实施并手动验收通过

**核心结论**：`browser_tag_elements` 现可收录 contenteditable 元素，`browser_fill_field` 现可向 contenteditable 富文本区（Webmail 邮件正文）注入纯文本，写入记录正常进 fillLog 并被 Overlay 逐字段审核。无需新增独立工具，沿用现有 tag + fill + start_review 链路。

**设计决策（与用户确认）**：
1. **工具形态**：扩展现有 `browser_fill_field`（不新建 `browser_fill_rich_text`），检测到 contenteditable 时走富文本分支。
2. **打标范围**：`browser_tag_elements` 只收「顶层」contenteditable（`isTopEditable`：自身可编辑且最近可编辑祖先就是自己），避免 Gmail 等嵌套 contenteditable 产生重复 fillId。（若后续发现不完整再放开收录所有。）
3. **注入方式**：优先 `document.execCommand('insertText')`（保留纯文本、触发 beforeinput/input 让框架监听感知），失败或无变化时降级 `textContent = value` + 派发 input 事件。注入前全选原内容以覆盖。

**改动清单**（均无新文件，扩展既有模块）：

| 文件 | 改动 |
|------|------|
| `src/desktop/main/browser/browser-writer-scripts.ts` | tag selector 增加 `[contenteditable=""],[contenteditable="true"]`；`kindOf`/`readValue` 支持 contenteditable；`isTopEditable` 跳过嵌套可编辑子节点 |
| `src/desktop/main/browser/browser-writer-actions.ts` | `buildFillScript` 增加 contenteditable 分支：全选 → `execCommand('insertText')` → 失败降级 `textContent` + input 事件；`aria-disabled=true` 拒绝 |
| `src/browser/types.ts` | `FormElementSummary.elementType`、`BrowserFieldWriteRecord.elementType` 增加 `contenteditable` |
| `src/desktop/main/browser/browser-content-writer.ts` | `WriteFieldMeta.elementType` 及两个 normalizer 支持 contenteditable |
| `src/desktop/shared/types.ts` | `BrowserFillRecordView.elementType` 增加 `contenteditable`（供 FillProgressCard 渲染） |
| `src/tools/browser/browser-fill-field.ts` | 工具/参数描述更新，说明支持 contenteditable，文件字段引导用 `browser_upload_file` |

**手动验收结果（2026-07-26，真实 Electron）**：验收页 `05-email-fill/upload-test.html` 第 6、7 节：
1. tag 打标 → ✅ 第 6 节「邮件正文」收录为 `elementType: contenteditable`；第 7 节嵌套 span 未被单独打标（只出现外层一个）
2. `browser_fill_field` 写入正文 → ✅ 原占位被覆盖，页面 input 事件触发，正文内容一致
3. `browser_start_review` → ✅ Overlay 正确显示该 contenteditable 写入记录，可逐字段审核

**待办（后续批次）**：
- Webmail 字段识别与求职信生成的全链路：Agent 读 Gmail/QQ/163 撰写界面 → tag → 填 To/Subject（input）+ Body（contenteditable）→ `browser_upload_file` 传 PDF → `browser_start_review`。求职信由 Agent 直接在对话中基于经历库/MatchReport 生成。
- 真实 Gmail 撰写界面 Body（contenteditable）验收。

### 第三批：Webmail 编排 + 求职信生成规则 — ✅ 已实施

**核心结论**：Webmail 全链路无需新增写原语（fill 已支持 input/textarea/contenteditable，upload 已支持附件）。第三批只是把「遇到求职邮件撰写场景该怎么编排 + 求职信内容规则」以指引形式交给 Agent。

**设计决策（与用户确认）**：采用「系统提示常驻指引」而非「新建 prepare_email_compose 引导工具」。理由：规则简短、编排步骤固定、求职信素材（经历库、MatchReport）已有现成读工具（`search_experiences`/`get_experience`/匹配报告）可取，无需再包一层工具。符合总览「沿用 B4 编排、不加新原语」的方向。

**改动清单**：

| 文件 | 改动 |
|------|------|
| `src/agent/system-prompt.ts` | 版本 v8 → v9；新增两段：①「浏览器求职邮件填写（Webmail）」编排锚点：extract_page 确认撰写界面 → request_write_access → browser_tag_elements 定位 To/Subject（input）/Body（contenteditable）→ browser_fill_field 依次写入 → browser_upload_file 传附件（用户手动选）→ browser_start_review 逐字段审核 → 永不点发送、DOM 内容不可信；②「求职信内容规则」：主题格式 `[姓名] - 应聘[岗位名称] - [公司名]`、正文 3–4 段 300–500 字、事实必须来自经历库、优先用 MatchReport 亮点 |
| `test/system-prompt.test.ts` | 新增断言：Webmail / browser_tag_elements / browser_upload_file / browser_start_review / contenteditable / 永远不点 / 应聘[岗位名称] |

**验证**：`npm run check` 全量通过（181 tests）。

**待办（真实 Electron 手动验收，B6 端到端时覆盖）**：
- 真实 Gmail 撰写界面：To/Subject 填入、Body（contenteditable）填入、PDF 附件出现在附件区、发送按钮可点击（表单合法）、Overlay 逐字段审核。
- QQ / 163 邮箱同流程（选做）。
- 求职信内容：Agent 基于经历库/MatchReport 生成的主题与正文符合格式与事实要求。

