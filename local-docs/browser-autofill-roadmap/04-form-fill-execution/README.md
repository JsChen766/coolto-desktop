# B4：填写执行与 Overlay 审批编排

> 状态：✅ 已实施（手动验收待做）
> 前置：B3 页面操作（写）工具完成，用户已确认填写范围

## 目标

在 B3 提供的写原语之上，建立**审批编排层**：用户确认填写范围后，Agent 用 B3 的 `browser_*` 写工具批量填写，填写完成后向页面注入「审批 Overlay」，让用户逐字段确认或拒绝，最终由用户手动提交。

> ⚠️ **2026-07-25 重定位（与 B3 联动）**：写原语（`browser_fill_field` / `browser_select_option` / `browser_click_element` / `browser_scroll_to` 等）已前移到 **B3**，B4 不再新建这些工具。B4 专注：范围预审卡、Overlay 事后逐项审核、验证码暂停、L3 手动降级、填写进度面板。下方「核心产物」中标注 ~~删除线~~ 的工具项均归 B3，B4 只**调用**它们。

---

## 核心设计

**Agent 是执行者，B3 原语是手脚，B4 是审批闸门。**
填写过程由 Agent 主导编排（决定顺序、如何处理非标准字段、异常降级），调用 B3 写原语执行。B4 负责在执行前后加审批（范围预审 + 事后 Overlay）。

**填写完成前用户只能旁观；填写完成后用户全权审批。**
Overlay 注入后浏览器锁定，用户可滚动查看所有填写结果，但无法直接操作表单，直到做出全局决策（全部接受 / 全部拒绝）。

---

## 核心产物

### Agent 工具（写原语已归 B3，此处仅列 B4 调用关系）

| 工具 | 归属 | B4 中的角色 |
|------|------|------------|
| ~~`browser_fill_field`~~ | **B3** | B4 编排 Agent 调用它逐字段填写；返回 `'filled' \| 'failed' \| 'skipped'` |
| ~~`browser_select_option`~~ | **B3** | 同上，处理 select |
| ~~`browser_click_element`~~ | **B3** | 同上，提交/发送按钮由 B3 原语拒绝 |
| ~~`browser_scroll_to`~~ | **B3** | 填写前确保字段可见 |

> B4 不新建 `src/tools/browser-*.ts`，直接复用 B3 已实现的写工具。

### 主进程（`src/desktop/main/browser/`）

| 文件 | 职责 |
|------|------|
| `browser-captcha-detector.ts` | 注入轻量检测脚本，识别 reCAPTCHA / 滑块 / 图片验证码特征；检测到后推送 `browser:captcha-detected` 并通知 Agent 暂停 |
| `browser-overlay-injector.ts` | 填写完成后注入 Overlay 脚本：创建半透明遮罩层（`pointer-events: all` 拦截点击）、为每个 `data-fill-id` 元素注入浮动 ✓/✗ 徽章、固定顶部工具栏；挂载 `window.__fillReview` 状态对象 |
| `browser-overlay-poller.ts` | 每 300ms 轮询 `window.__fillReview`；检测到 `globalAction` 后执行相应操作（保留 / 还原字段），然后注入移除脚本清除 Overlay，推送 `browser:review-complete` |

### Renderer（`src/desktop/renderer/src/`）

| 文件 | 职责 |
|------|------|
| `components/FillProgressPanel.vue` | 右侧面板（Agent 填写期间显示）：实时显示每个字段的填写状态（pending / filling / filled / failed / skipped）；当前正在填写的字段名高亮；失败字段列表；「中止填写」按钮 |
| `browser/use-fill-progress.ts` | Composable：订阅 `browser:fill-progress` IPC，维护 `fieldResults: FieldFillResult[]` 的响应式状态 |

---

## 字段注入逻辑

> 以下注入实现（`data-fill-id` 定位、React/Vue 受控输入兼容、原生 setter 绕过）是 **B3 写原语的内部实现**，随写工具一起在 B3 落地。此处保留作为 B4 编排时的行为参考。

### 定位策略

B3 的 `browser_tag_elements` 已为可操作元素注入 `data-fill-id`，写原语通过此属性定位，不依赖易变的 DOM 路径。

```javascript
// browser_fill_field 工具内部注入的脚本（executeJavaScript 执行）
const el = document.querySelector(`[data-fill-id="${fieldId}"]`);
if (!el) return { status: 'failed', reason: 'element_not_found' };

el.scrollIntoView({ block: 'center' });
el.focus();

// React 受控输入兼容：使用原生 setter 绕过 React 的 value 劫持
const nativeSetter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype, 'value'
).set;
nativeSetter.call(el, value);

el.dispatchEvent(new Event('input', { bubbles: true }));
el.dispatchEvent(new Event('change', { bubbles: true }));
el.blur();
```

### 受控输入兼容

| 框架 | 处理方式 |
|------|---------|
| React | 原生 prototype setter + 合成 input/change 事件 |
| Vue 3 | 原生 setter + input 事件（Vue 3 响应式监听 input） |
| 原生 HTML | 直接 `.value =` + input/change 事件 |
| Select | `.value =` + change 事件；自定义 Select 组件标记 failed |
| Textarea | 同 input，支持多行文本 |

### 填写顺序与节奏

- Agent 自主决定填写顺序（通常按 DOM 出现顺序，但可根据字段语义调整）
- 每个字段之间等待 `browser_fill_field` 返回后再填下一个（串行，不并发）
- 每次调用间隔至少 100ms，避免触发反爬机制

### 失败处理

| 失败原因 | Agent 行为 |
|---------|-----------|
| 元素不存在（`element_not_found`） | 调用 `browser_find_element` 重新定位；仍失败则标记 failed，继续下一字段 |
| 元素不可见 / 禁用 | 标记 skipped，继续 |
| 验证码检测 | `browser:captcha-detected` 推送，Agent 在聊天中告知用户手动通过验证码，等待 `browser:captcha-cleared` 后继续 |
| Agent 主动决定跳过 | 标记 skipped，附上 skipReason（如"此字段未找到对应数据"） |

---

## Overlay 审核阶段

> 本节的审核规则以用户 2026-07-25 澄清为准：
> 1. **每个写入点**旁有 ✓ 接受 / ✗ 拒绝；页面顶部有全局「全部接受」「全部拒绝」。
> 2. **单个拒绝不影响全局接受**：用户拒绝了某几个写入点后再点「全部接受」，系统接受【除已拒绝以外】的所有写入点。
> 3. **强制处理完所有写入点才解锁**：在所有写入点的接受/拒绝都点完之前，整个页面锁定不可操作；**绝不允许用户点「发送」「投递」类按钮**，直到全部处理完毕。
> 4. 解锁 = 所有写入点均已决定（不要求必须点全局按钮，逐个点完也解锁）。

### Overlay 注入内容

```javascript
// browser-overlay-injector.ts 注入的脚本示意
// 1. 全局遮罩（阻止所有表单交互）
const mask = document.createElement('div');
mask.id = '__fill-mask';
mask.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:99998;pointer-events:all;background:rgba(0,0,0,0.05);';
document.body.appendChild(mask);

// 2. 顶部固定工具栏
const toolbar = document.createElement('div');
toolbar.id = '__fill-toolbar';
toolbar.innerHTML = `
  <button id="__fill-accept-all">全部接受</button>
  <button id="__fill-reject-all">全部拒绝</button>
  <span>请检查填写结果，完成后点击接受或拒绝</span>
`;
// 注：工具栏的 z-index 高于遮罩层，可点击

// 3. 每个已填字段旁注入 ✓/✗ 徽章
filledFields.forEach(({ fieldId, originalValue }) => {
  const el = document.querySelector(`[data-fill-id="${fieldId}"]`);
  const badge = document.createElement('div');
  badge.dataset.fillBadge = fieldId;
  badge.innerHTML = `<button data-action="accept">✓</button><button data-action="reject">✗</button>`;
  // 浮动定位：紧贴 el 的右侧
  el.parentNode.insertBefore(badge, el.nextSibling);
});

// 4. 状态对象
window.__fillReview = { decisions: {}, globalAction: null };
```

### 用户操作响应（Overlay 内 JS）

**核心规则（2026-07-25 用户澄清）：**
- **单个拒绝不影响全局接受**：「全部接受」只接受【尚未被单独拒绝】的写入点（已拒绝的保持清空）
- **强制处理完所有才解锁**：所有写入点的接受/拒绝都点完之前，页面锁定、不可操作；不要求必须点全局按钮，逐个点完也解锁
- **解锁告知主进程**：全部处理完毕后，`globalAction` 设为 `'accept_all'`（不论实际是接受还是拒绝——解锁只意味着"用户已全部审阅完"，具体决策保存在 `decisions` 中供主进程处理）

```javascript
// 检查是否所有写入点均已决定，若是则自动解锁
function checkAllDecided() {
  const allFieldIds = Object.keys(window.__fillReview.decisions);
  if (allFieldIds.length === 0) return;
  const allDecided = allFieldIds.every(
    id => window.__fillReview.decisions[id] !== 'pending'
  );
  if (allDecided) {
    window.__fillReview.globalAction = 'accept_all'; // 解锁信号
  }
}

// 单个字段接受
document.querySelectorAll('[data-action="accept"]').forEach(btn => {
  btn.addEventListener('click', e => {
    const fieldId = e.target.closest('[data-fill-badge]').dataset.fillBadge;
    window.__fillReview.decisions[fieldId] = 'accepted';
    // 视觉标记高亮
    checkAllDecided();
  });
});

// 单个字段拒绝：立即清空
document.querySelectorAll('[data-action="reject"]').forEach(btn => {
  btn.addEventListener('click', e => {
    const fieldId = e.target.closest('[data-fill-badge]').dataset.fillBadge;
    const el = document.querySelector(`[data-fill-id="${fieldId}"]`);
    el.value = '';  // 清空（拒绝 = 清空，不还原原始值）
    window.__fillReview.decisions[fieldId] = 'rejected';
    checkAllDecided();
  });
});

// 全局接受：只接受尚未被单独拒绝的写入点
document.getElementById('__fill-accept-all').addEventListener('click', () => {
  Object.keys(window.__fillReview.decisions).forEach(id => {
    if (window.__fillReview.decisions[id] === 'pending') {
      window.__fillReview.decisions[id] = 'accepted';
    }
  });
  window.__fillReview.globalAction = 'accept_all';
});

// 全局拒绝：还原所有字段（含已单独接受的），触发解锁
document.getElementById('__fill-reject-all').addEventListener('click', () => {
  document.querySelectorAll('[data-fill-id]').forEach(el => {
    el.value = el.dataset.fillOriginal || '';
  });
  window.__fillReview.decisions = {};
  Object.keys(window.__fillReview.decisions).forEach(id => {
    window.__fillReview.decisions[id] = 'rejected';
  });
  window.__fillReview.globalAction = 'reject_all';
});
```

### 主进程轮询逻辑

```text
注入 Overlay 后，browser-overlay-poller.ts 每 300ms 执行：
  executeJavaScript('window.__fillReview')
  → globalAction === 'accept_all'：
      移除 Overlay（注入清理脚本），解锁浏览器
      推送 browser:review-complete { action: 'accepted', acceptedCount, rejectedCount }
  → globalAction === 'reject_all'：
      字段已由 Overlay 内 JS 还原
      移除 Overlay，解锁浏览器
      推送 browser:review-complete { action: 'rejected' }
  → globalAction === null：继续轮询
```

### Overlay 解锁流程

```
全局接受 / 拒绝
  └─ 主进程检测到 globalAction
       ├─ 停止 300ms 轮询
       ├─ executeJavaScript('document.getElementById("__fill-mask").remove(); ...')
       └─ 推送 browser:review-complete
            └─ 主窗口显示 DeliveryConfirmCard（B6 产物）
```

---

## 安全约束

- **写权限前置**：进入填写前 B3 的写权限闸门必须已授予（`request_write_access` 经用户确认）；未授予时 B3 写原语直接返回 `isError`，B4 流程无从启动
- `browser_click_element` 执行前正则匹配按钮文本（提交/发送/Submit/Send 等），匹配则返回 `blocked`，Agent 不得绕过
- `inputType === 'password'` 字段，`browser_fill_field` 自动返回 `skipped`，不允许填写
- Agent 不能调用任何导航工具（`browser_navigate` 不作为 Agent 工具暴露）
- Overlay 锁定期间，主进程拒绝新的写请求；所有写入点处理完前，禁止用户点提交/发送

---

## 本阶段不做

- 文件上传（`inputType === 'file'`）：标记 skipped，B5 负责邮件 PDF 附件上传
- 多步骤跨页面表单：当前阶段仅处理单页；页面跳转后 Overlay 会丢失，下一步表单重新走 B3
- 自定义 Canvas 渲染字段：不支持，标记 failed 后面板提示手动填写

---

## 完成门槛

- Agent 调用 B3 的 `browser_fill_field` / `browser_select_option` 等写原语在 Boss 直聘申请页面逐字段填写，各字段值正确填入并触发 React/Vue 受控响应
- 填写完成前 FillProgressPanel 正确显示每字段的实时状态（pending / filling / filled / failed / skipped）
- 填写完成后 Overlay 正确注入：遮罩可见、每个字段旁浮现 ✓/✗ 徽章、顶部工具栏显示
- 点击「✗ 拒绝」单个字段，该字段值立即清空，其余字段不受影响，浏览器不解锁
- 点击「全部接受」，Overlay 移除，浏览器解锁，字段值保留
- 点击「全部拒绝」，所有字段还原为填写前的值，Overlay 移除，浏览器解锁
- 遇到滑块验证码时 Agent 暂停并在聊天中提示用户
- `npm run check` 通过；新文件均在 250 行以内

---

## 完成记录（2026-07-26）

> 状态：✅ 已实施，`npm run check` 全量通过；真实 Electron 手动验收待做。
> 与主文档对齐的取舍：**沿用 B3 写权限闸门做入口，不加范围预审卡**；
> Overlay 期在闸门里加 `reviewing` 位阻拦新写入；用户切走 tab 不干预；
> 验证码 2s 低频轮询；FillProgress 内联在聊天面板；用户"中止填写"= 立即
> 进入 Overlay 审核（已写字段不能绕过审核直接生效）；`input[type=file]`
> 由 B3 已 skipped，B4 只在进度卡片上提示。

### 主进程新增/改动

| 文件 | 行数 | 说明 |
|------|------|------|
| `src/browser/types.ts`（改）| 112 | 追加 `BrowserFieldWriteRecord` / `FieldReviewDecision` / `ReviewOutcome` / `CaptchaDetection`；`BrowserPageOperator` 加 `isReviewing` / `getFillLog` / `enterReview` / `exitReview` |
| `src/desktop/main/browser/browser-write-access-gate.ts`（改）| 142 | 新增 `#reviewing` 位 + `setReviewing()` / `isReviewing()`；`check()` 遇 reviewing 一律返回"上一批写入正等待用户审核，暂不接受新的写入" |
| `src/desktop/main/browser/browser-writer-actions.ts`（改）| 196 | fill/select/setChecked 脚本改为返回 `{ok,valueBefore,valueAfter,label,elementType}`，供 fillLog 追踪原值/新值 |
| `src/desktop/main/browser/browser-content-writer.ts`（改）| 175 | 新增 `WriteFieldMeta`，fill/select/setChecked 返回该结构；正则化 `elementType` |
| `src/desktop/main/browser/browser-page-operator.ts`（改）| 202 | 加 `#fillLog`；每次 fill/select/setChecked 成功后 upsert 一条（同 fillId 保留最初 valueBefore）；新增 `ReviewStarter` + `WriteAccessLifecycle` 接口；`grantWriteAccess` 触发 `lifecycle.onGranted`，`revokeWriteAccess` 清 fillLog + `onRevoked`；`enterReview` 校验非空后翻 gate 位并调用 reviewStarter；`exitReview` 清 fillLog + 翻 gate 位 |
| `src/desktop/main/browser/browser-overlay-scripts.ts` | 176 | 三段注入脚本：`buildOverlayInjectScript(records)` 挂 mask + toolbar + 每字段 ✓/✗ 徽章 + `window.__coolto_review` 状态；`buildOverlayPollScript()` 读快照；`buildOverlayRemoveScript()` 清理 |
| `src/desktop/main/browser/browser-overlay-injector.ts` | 52 | 主进程侧 `injectOverlay` / `pollOverlay` / `removeOverlay` 封装（executeJavaScript + 结果规范化）|
| `src/desktop/main/browser/browser-captcha-scripts.ts` | 37 | `buildCaptchaProbeScript()`：扫描 reCAPTCHA/hCaptcha/极验/滑块/图形验证码特征 |
| `src/desktop/main/browser/browser-captcha-probe.ts` | 33 | 探针的主进程封装 + `kind` 规范化 |
| `src/desktop/main/browser/browser-overlay-poller.ts` | 145 | `BrowserOverlayPoller` 类：300ms 轮询 `window.__coolto_review`；`onDecision`/`onComplete`/`onError` 回调；complete 后自动 remove Overlay + 停轮询 |
| `src/desktop/main/browser/browser-captcha-detector.ts` | 70 | `BrowserCaptchaDetector` 类：2s 轮询；同 kind 不重复上抛；`start/stop` 由 gate 生命周期触发 |
| `src/desktop/main/browser/browser-review-orchestrator.ts` | 96 | 组合 Poller + Detector + operator，把 review/captcha 编排从 window-manager 抽出来（避免上帝类）|
| `src/desktop/main/browser/browser-window-factory.ts` | 86 | 抽离 BrowserWindow 创建 + shell 加载 + shell-state 派生（同上目的）|
| `src/desktop/main/browser/browser-window-manager.ts`（改）| 250 | 持有 `#review`；`emitters` 扩到 6 个（+fillProgress/reviewDecision/reviewComplete/captchaDetected）；grant/revoke 通过 lifecycle 联动 captcha 探针；`abortFill()` 复用 orchestrator |
| `src/desktop/main/browser/browser-ipc-channels.ts`（改）| 46 | 新增 `fillProgress/reviewDecision/reviewComplete/captchaDetected/abortFill` |
| `src/desktop/main/browser/browser-ipc.ts`（改）| 130 | 主窗口 sendMain 广播 4 个新事件；`browser:abort-fill` invoke 处理；`BrowserFillRecordView` 映射（初始 decision=pending）|
| `src/desktop/main/browser-write-access-continuation.ts`（改）| 59 | 续接 prompt 明确要求"完成本轮写入后必须调用 browser_start_review"|

### Agent 工具

| 文件 | 行数 | 说明 |
|------|------|------|
| `src/tools/browser/browser-start-review.ts` | 70 | 新工具 `browser_start_review`：无参数（可选 note）；调用前校验已授权 + fillLog 非空 + 未 reviewing；调 `operator.enterReview()` 并回文本要求 Agent 停手等 `browser.review.complete` |
| `src/tools/browser/index.ts`（改）| 32 | 新工具加入注册序列 |

### 渲染进程（`src/desktop/renderer/src/`）

| 文件 | 行数 | 说明 |
|------|------|------|
| `src/desktop/renderer/src/browser/use-fill-progress.ts` | 108 | Composable：订阅 `browser:fill-progress` / `review-decision` / `review-complete` / `captcha-detected`；维护 `records/reviewing/lastOutcome/captcha` + 计数 computed；`abortFill/dismissOutcome/dismissCaptcha` 方法 |
| `src/desktop/renderer/src/components/FillProgressCard.vue` | 249 | 内联在聊天面板：字段列表 + ✓/✗/待审核徽章 + 计数 + "中止并进入审核"按钮 + Overlay 结果/验证码提示条 |
| `src/desktop/renderer/src/App.vue`（改）| 351 | 挂载 FillProgress composable + 卡片；watch 加入 fillProgress 相关状态触发滚动到底 |
| `src/desktop/shared/types.ts`（改）| 460 | `DesktopApi.browser` 加 `abortFill` + 4 个 `on*` 订阅方法；新增 `BrowserFillRecordView` |
| `src/desktop/preload/index.ts`（改）| 108 | 暴露 5 个新桥接；抽出 `subscribeIpc` 泛型辅助 |
| `src/desktop/renderer/src/lib/desktop-api.ts`（改）| 662 | Demo API + fallback API 补齐同名方法（返回 no-op unsubscribe）|

### 关键实现决策

1. **不加范围预审卡**（用户确认）：B3 的 `request_write_access` 已经在 Agent 开始写入前弹一次审批卡；B4 只在 Agent 完成一批写入后通过 `browser_start_review` 触发 Overlay，避免用户被两轮卡片打扰。
2. **审核锁定通过 gate.reviewing 位**（用户确认）：不加独立 ReviewLock；`gate.check()` 遇到 `reviewing` 直接以 isError 返回；Agent 会自然停手等待 `browser.review.complete` 事件。
3. **abort = 强制进入审核**（用户确认）：`browser:abort-fill` IPC 落到 `BrowserWindowManager.abortFill()` → `operator.enterReview()`；已写入字段一律走 Overlay 逐字段决定，绝不允许绕过审核直接生效。fillLog 为空时 abort 是 no-op。
4. **fillLog 逐条 upsert**：同一 fillId 多次写入合并；保留**最初的** valueBefore（用于"全部拒绝"还原）+ 最新的 valueAfter（用于"接受"时展示）。
5. **Overlay 单个 ✗ = 清空/还原**：文本/下拉沿用 B0 规则「清空」（不还原原值）；勾选框（checkbox/radio）「还原为填写前的原始勾选状态」（见下方手动验收修复第 3 条）。只有"全部拒绝"才对所有字段 restore(valueBefore)。所有字段都决定后 `globalAction='auto'` 自动解锁。
6. **验证码探针作用域**：只在写权限授予期间轮询；`WriteAccessLifecycle` 触发 `startCaptchaProbe/stopCaptchaProbe`；探到即 IPC 上抛给渲染进程展示，Agent 侧不做特殊处理（gate 若在 reviewing 或权限被收回，写工具会自动 isError）。
7. **BrowserWindowManager 抽拆**：新增 `browser-review-orchestrator.ts`（编排）+ `browser-window-factory.ts`（窗口创建/shell 加载），把 manager 稳在 250 行内，符合"禁止上帝类"。
8. **续接 prompt 更新**：B3 加过一次"授权后自动续接"；B4 在续接 prompt 里明确写"完成本轮写入后必须调用 browser_start_review"，Agent 不会漏调审核入口。

### 验收状态

- `npm run check` 全量通过（typecheck + desktop:typecheck + 181 test + build + desktop:build）
- 所有新文件 ≤ 250 行；最大 `browser-window-manager.ts` 250 行（含 B1/B2/B3 遗留）
- **待做（真实 Electron 手动验收）**：
  1. 打开 Boss 直聘投递页 → Agent 调 `request_write_access` → 用户接受 → Agent 用 fill/select/setChecked 写 3-5 个字段 → 调 `browser_start_review` → 页面出现 mask + toolbar + 每字段旁 ✓/✗ 徽章
  2. 点单个 ✗：该字段值立即清空，其他字段不受影响，页面不解锁；主窗口卡片对应行变红并显示"已拒绝"
  3. 处理完所有字段（不点全局按钮）：Overlay 自动移除；主窗口卡片显示"接受 X 拒绝 Y"结果条
  4. 点"全部接受"：仅接受尚未拒绝的；"全部拒绝"：所有字段 restore 到 valueBefore
  5. 审核期间 Agent 再调 `browser_fill_field` → 返回 isError "上一批写入正等待用户审核"
  6. 点主窗口卡片"中止并进入审核"：即使 Agent 还在写，也立即注入 Overlay 让用户逐项决定
  7. 打开一个带 reCAPTCHA 的页面 + 授权 → 2s 内主窗口出现验证码提示条；用户点"已处理"关掉
  8. 授权 tab 导航到新 origin → 卡片自动清空 + gate 收回；Overlay/验证码探针都停

### 与 B3 遗留能力的关系

- 写权限闸门（5min TTL、tab+origin 绑定、切走暂失效、改 origin 硬收回）保留原状；B4 只叠加一个 `reviewing` 位
- 提交按钮双闸（Agent 层 description + 主进程正则）保留原状；Overlay mask 只拦截**用户**的表单交互，Agent 的 click 依然被 `browser-click-guards.ts` 拦
- `browser_upload_file` 依然归 B5；B4 期间 `input[type=file]` 由 `browser_fill_field` 返回 `file_input_use_upload_tool`，进度卡片会展示为"未写入"跳过

### 真实 Electron 手动验收后的修复记录

实测 Overlay 后发现三处问题，均已修复并跑通 `npm run check`（181 tests, fail 0）；改动集中在 `browser-overlay-scripts.ts`。

1. **顶部工具栏遮挡页面**：inject 时把工具栏真实高度加到 `body.paddingTop`（原值存 `data-coolto-prev-pad`，remove 时还原），页面整体下移，工具栏不再压住首屏内容。
2. **字段徽章遮挡（尤其 checkbox/radio 密集排列）**：
   - 先尝试过「四方向试探 + `elementFromPoint`/`caretRangeFromPoint` 碰撞检测找空隙」，实测对小尺寸勾选框仍无改善，已回退。
   - 最终改用**半透明策略**：徽章默认 `opacity:.35`（能看清底下文字），`:hover` 恢复 `opacity:1`；`positionBadge` 保持简单的四方向（右→左→上→下）视口内试探。
3. **勾选框拒绝后无法还原**：根因是 `restoreValue`/`clearValue` 只改 `el.value`，而 checkbox/radio 状态在 `el.checked`。现按 `elementType` 分流——勾选框操作 `el.checked`（用 `valueBefore==='选中'` 判定原始态），其余走 `el.value`；单个 ✗ 对勾选框改为**还原原始勾选状态**（`rejectValue`），文本/下拉仍清空；"全部拒绝"对所有字段（含勾选框）走 `restoreValue`。
