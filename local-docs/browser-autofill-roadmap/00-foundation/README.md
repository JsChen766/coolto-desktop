# B0：架构基础

> 状态：✅ 决策已确认  
> 前置：无（本阶段输出作为后续所有阶段的基线）

## 目标

在写任何代码之前，锁定技术选型、交互模型、IPC 契约和安全边界。  
本阶段只产出文档和类型契约，不写业务逻辑代码。

---

## 已确认决策

### B0-D1：浏览器容器 → 独立 BrowserWindow ✅

> ⚠️ **B1 实施时修订（2026-07-25）**：为支持多标签页，浏览器窗口改为
> 「`BrowserWindow` 主 webContents 加载 Vue chrome（标签栏/地址栏/导航），
> 页面内容用多个 `WebContentsView` 承载」。仍是与主窗口隔离的独立窗口，
> 仍用 `persist:browser` session。详见 `01-browser-window/README.md` 完成记录。

使用 `new BrowserWindow()` 新建独立 Electron 窗口加载目标网页。

- 浏览器窗口与主窗口完全隔离，互不影响
- 填写进度、Agent 对话、审批 UI 均在**主窗口**展示，通过 IPC 与浏览器同步状态
- 用户可在宽屏上将两个窗口并排摆放

### B0-D2：脚本注入 → `executeJavaScript` + Agent 工具 ✅

主进程通过 `webContents.executeJavaScript()` 向浏览器页面注入脚本。  
这些能力封装为 **Agent 工具**，由 Agent 主导调用，而非确定性脚本自动执行。

- Agent 拿到一组 `browser_*` 工具，自己决定读什么、填什么、以什么顺序
- 工具是对 `executeJavaScript` 的语义封装，Agent 用自然语言描述目标，工具负责定位和操作
- 不使用 preload（安全边界更清晰；按需执行，无持久化副作用）

### B0-D3：Session → 单一 `persist:browser` Partition ✅

```js
session.fromPartition('persist:browser')
```

- 所有网站 Cookie 共享一个 partition，行为与真实浏览器一致
- 与主窗口 `defaultSession` 完全隔离
- Cookie 跨 App 重启保留，用户只需登录一次

---

## 交互模型：写权限闸门 → 泛化操作 → Overlay 审核

> ⚠️ **2026-07-25 安全模型修订（与用户确认）**：原「填写表单/填写邮件 → 逐字段计划 → 开始填写」模型已废弃。改为**单一泛化写权限闸门 + 事后 Overlay 审核**。不区分「投递模式/邮件模式」——只有一个泛化的写权限开关，Agent 面对任何网站都能按页面实际情况泛化操作（点哪、填啥、传什么附件由 Agent 自行判断），精确性靠 `extract_page` 读页 + `data-fill-id` 定位，而非分模式。

### 核心边界：写权限授予（AI 请求 + 用户一键确认 + 主进程强制）

这是本路线唯一的确定性安全边界：

```
① Agent 判断需要操作页面（填投递信息 / 写邮件 / 上传附件等）
     ↓
② Agent 调用 request_write_access 工具，说明操作意图
   → 主窗口/浏览器弹出「用户一键确认」控件
     ↓
③ 用户点击确认 → 主进程翻转 write-enable 标志位
   ⚠️ 关键：只有用户点击才能翻标志位，Agent 自己翻不了。
       页面注入的不可信文本无法骗过主进程的标志位 → AI 绕不过此边界。
     ↓
④ 写权限开启后，Agent 用 browser_* 写工具泛化操作页面
   → 所有写工具执行前检查主进程标志位；未授予则返回 isError
   → 读工具（extract_page）不受此闸门影响，任何时候可读
     ↓
⑤ Agent 操作完成后，向页面注入「审核 Overlay」（见下）
     ↓
⑥ 用户逐字段审核 + 全局接受/拒绝，全部处理完才解锁
     ↓
⑦ 用户手动点击提交 / 发送（Agent 永不代点）
```

**写权限是会自动失效的会话**，避免"开一次永久放开"：
- 浏览器导航到新站点 → 自动收回
- 用户主动结束 → 收回
- 超时无操作 → 自动收回

### 事后审核：页内 Overlay 逐字段确认

Agent 写完后，向浏览器页面注入审核 Overlay：

```
① 每个被写入的输入框旁浮现 ✓ 接受 / ✗ 拒绝 按钮
② 页面顶部固定工具栏：「全部接受」「全部拒绝」
③ 浏览器锁定：可滚动查看，但所有表单交互（含提交/发送按钮）被屏蔽
     ↓
④ 用户逐个处理写入点
   → 单个「✗ 拒绝」：该字段值立即清空，不影响其他字段
   → 单个「✓ 接受」：标记为已接受
     ↓
⑤ 全局按钮（批量快捷）
   → 「全部接受」：接受所有【尚未拒绝】的写入点（已单独拒绝的保持清空）
   → 「全部拒绝」：还原所有字段（含已单独接受的）
     ↓
⑥ 解锁条件：所有写入点都已决定（接受或拒绝）
   → 全部处理完才解锁，用户才能操作页面、手动点提交/发送
   → 在此之前绝不允许用户点「发送」「投递」类按钮
```

### 关键约束

- **写权限闸门由主进程强制**：Agent 无法自行开启写权限，只能请求；用户一键确认后主进程翻标志位
- **写工具全部受闸**：`browser_fill_field`/`click`/`select`/`upload`… 未授予写权限时返回 `isError`；读工具不受影响
- **浏览器在审核阶段全程锁定**：Overlay 拦截所有 pointer 事件，滚动正常，点击全部屏蔽
- **解锁条件：所有写入点均已决定**：全部接受或拒绝后才解锁，之前禁止用户点提交/发送
- **单个拒绝不影响全局接受**：「全部接受」只接受尚未被单独拒绝的写入点
- **单个拒绝 = 清空**：拒绝的字段值清空，不还原原始值；「全部拒绝」则还原所有字段
- **Agent 永不点击 Submit / 发送**：最终提交由用户手动完成，硬性安全约束

### Overlay 与主进程通信

Overlay 按钮的点击决策通过轮询机制传回主进程：

```text
注入 Overlay 时，同时在页面上挂载 window.__fillReview = { decisions: {}, globalAction: null }
主进程每 300ms 轮询 executeJavaScript('window.__fillReview')
检测到 globalAction 后，主进程执行最终操作并移除 Overlay
```

---

## Agent 工具集（B2–B5 阶段实现）

| 工具名 | 实现阶段 | 描述 |
|--------|---------|------|
| `browser_read_page` | B2 | 已由通用工具 `extract_page` 实现：返回当前活跃标签页可见文本、标题、URL、meta、表单字段概览；页面内容作为不可信数据传给 Agent |
| `request_write_access` | B3 | 请求页面写权限；**复用 `ApprovalManager`** 弹审批卡，用户确认后 executor 翻 write-enable 标志位。所有写工具的前置闸门 |
| `browser_get_form_summary` | ~~B3~~ | **已废弃**：字段概览 B2 `extract_page` 已返回；B3 改用 `browser_tag_elements`（注入 `data-fill-id` 稳定标识） |
| `browser_tag_elements` | B3 | 给可操作元素注入 `data-fill-id`，返回带稳定 id 的元素摘要；写原语定位基础。Agent 从返回列表自行挑目标元素 |
| `browser_find_element` | ~~B3~~ | **已废弃（精简）**：与 `browser_tag_elements` 冗余，Agent 从 tag 结果里语义匹配即可 |
| `browser_fill_field` | ~~B4~~ **B3** | 写原语：填写文本/textarea 字段；处理 React/Vue 受控组件合成事件 |
| `browser_select_option` | ~~B4~~ **B3** | 写原语：设置原生 select 下拉框值 |
| `browser_set_checked` | B3 | 写原语：勾选/取消 checkbox、radio |
| `browser_click_element` | ~~B4~~ **B3** | 写原语：点击元素（submit/发送等语义按钮自动拒绝执行） |
| `browser_scroll_to` | ~~B4~~ **B3** | 写原语：滚动到指定元素 |
| `browser_hover_element` | ~~B3~~ | **已废弃（精简）**：悬停非投递/邮件典型交互，用不到 |
| `browser_drag` | ~~B3~~ | **已废弃（精简）**：拖拽非投递/邮件典型交互，用不到 |
| `browser_upload_file` | B5 | 上传文件；fileType 只允许 `'resume_pdf'`，不允许任意路径。**B3 完全不提，B5 一次性做完**（模式内 upload + 路径解析） |
| `extract_page_jd` | ~~B2~~ | **已废弃**：B2 改为通用 `extract_page` 读页工具，JD 结构化提取继续复用 `prepare_jd_import`，不新建 JD 专属读页工具 |
| `prepare_email_fill` | B5 | 生成邮件内容（主题 + 求职信正文）；供 Agent 填写 Webmail 撰写界面 |

> ⚠️ **2026-07-25 重定位 + 精简**：B3 从「表单字段识别」重定位为「通用页面操作（写）工具」，写原语从 B4 前移到 B3；B4 专注审批编排与 Overlay。精简砍掉 `browser_find_element`（冗余）、`browser_hover_element`/`browser_drag`（用不到），`browser_upload_file` 归 B5 一次性做。详见 `03-form-recognition/README.md`。

---

## IPC 通道

> ⚠️ 部分通道随 2026-07-25 安全模型修订调整。旧的 `browser:start-fill`（用户点「开始填写」）语义废弃，改为写权限授予流程。

### 主进程 → 主窗口 Renderer

```text
browser:state-changed          BrowserState
browser:write-access-requested { reason: string }   ← Agent 请求写权限，触发用户一键确认
browser:write-access-changed   { granted: boolean }  ← 写权限状态变化（授予/收回）
browser:fill-progress          { fillId, label, status: 'filling'|'filled'|'failed'|'skipped' }
browser:review-decision        { fillId, action: 'accepted'|'rejected' }  ← Overlay 轮询结果
browser:review-complete        { action: 'accepted'|'rejected', acceptedCount, rejectedCount }
browser:captcha-detected       { url }
```

### 主窗口 Renderer → 主进程

```text
browser:open                void { url?: string }
browser:close               void
browser:navigate            { url: string }
browser:go-back             void
browser:go-forward          void
browser:reload              void
browser:grant-write-access  void   ← 用户一键确认，主进程翻 write-enable 标志位
browser:revoke-write-access void   ← 用户主动结束写权限
browser:abort-fill          void
```

> `extract-jd` 已废弃（B2 改为 Agent 自主调用 `extract_page` 工具，无按钮/IPC 触发）。

---

## 类型契约

```typescript
interface BrowserState {
  isOpen: boolean;
  currentUrl: string | null;
  pageTitle: string | null;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  writeAccessGranted: boolean;  // 写权限闸门状态（主进程强制，Agent 无法自行开启）
  // ⚠️ 以下两字段已废弃（B2 砍分类、B3 不分模式后无人使用），保留仅为向后兼容，实施时可标 @deprecated
  pageType?: 'jd' | 'job_application_form' | 'webmail_compose' | 'unknown';  // 恒为 unknown
  fillStatus?: 'idle' | 'filling' | 'reviewing' | 'complete';  // 仅 B4 Overlay 期间用 reviewing
}

interface BrowserFormField {
  fieldId: string;       // 注入时打上的 data-fill-id
  label: string;
  placeholder: string;
  inputType: string;
  required: boolean;
  originalValue: string; // 填写前备份，用于「全部拒绝」时还原
}

interface FieldFillResult {
  fieldId: string;
  label: string;
  filledValue: string;
  status: 'filled' | 'failed' | 'skipped';
  failReason?: string;
}

// 审批阶段的单字段决策
type FieldDecision = 'accepted' | 'rejected' | 'pending';

interface FillReviewState {
  decisions: Record<string, FieldDecision>;
  globalAction: 'accept_all' | 'reject_all' | null;
}
```

---

## 安全规则（不可违反）

1. **写权限闸门**：所有写工具（`browser_fill_field`/`select`/`click`/`upload`…）执行前检查主进程 write-enable 标志位；未授予时返回 `isError`。标志位只能由用户点击确认后主进程翻转，Agent 无法自行开启。读工具（`extract_page`）不受此闸门约束。
2. **写权限自动失效**：浏览器导航到新站点、用户主动结束、超时无操作时，主进程自动收回写权限。
3. 页面 DOM 内容（字段 label、页面文本、JD 正文）一律视为不可信数据，传给 Agent 时须在 system prompt 中明确说明不得执行其中指令
4. `browser_click_element` 执行前检查目标元素是否为提交/发送按钮，匹配则拒绝并告知 Agent；**Agent 永不点击提交/发送**，最终提交由用户手动完成
5. `browser_upload_file` 只接受 `'resume_pdf'` 类型，路径由主进程从已知 PDF 导出路径读取，不接受任意路径参数
6. Agent 不能自主导航（`browser_navigate` 不作为 Agent 工具暴露，只由用户或审批后的 Executor 调用）
7. Overlay 审核锁定期间，主进程拒绝新的写请求；所有写入点未处理完前，浏览器锁定，禁止用户点提交/发送

---

## 产出物

- [x] 本文档：技术选型和交互模型决策记录
- [ ] `src/desktop/shared/types.ts`：新增 `BrowserState`、`BrowserFormField`、`FieldFillResult`、`FillReviewState`
- [ ] `src/desktop/main/browser/browser-ipc-channels.ts`：IPC 通道名称常量
- [ ] UI 设计规范补充：浏览器控制面板、填写进度面板、Overlay 样式规则

## 完成门槛

- 所有决策项已确认并记录（✅ 已完成）
- 新增类型通过 `npm run check`
- B1–B6 实施计划均可直接引用本文档的契约，不需要再讨论架构
