# B4 交接说明

> 用途：从 B3 完成状态交接给下一位实施 B4 的对话。B3（写原语 + 写权限闸门 + 审批后续接）已实施并通过 `npm run check`，B4 的设计已在 `README.md` 定型，本文档聚焦"怎么起手做 B4"。

---

## 第一步：必读文档（按顺序）

### 全局约定
- `/Users/apple/cv-agent-app/AGENTS.md` — 工作原则：**不确定必追问**、每阶段完成写回 roadmap、文件 ≤250 行、非用户要求不 commit

### B4 上下文（按顺序读）
1. `local-docs/browser-autofill-roadmap/README.md` — 路线总览 + 执行原则（读写分离、写权限闸门、不分模式、Agent 永不点提交、事后 Overlay 逐字段审核）
2. `local-docs/browser-autofill-roadmap/00-foundation/README.md` — B0 安全模型；**重点看**：
   - 「交互模型：写权限闸门 → 泛化操作 → Overlay 审核」整节
   - 「事后审核：页内 Overlay 逐字段确认」的规则（尤其单个拒绝=清空、全部接受只接受未被拒绝的、必须处理完所有写入点才解锁、Agent 永不代点提交）
   - IPC 通道列表里 `browser:review-decision` / `browser:review-complete` 相关
   - 类型契约里 `FieldDecision` / `FillReviewState` / `FieldFillResult` / `BrowserFillStatus`
3. `local-docs/browser-autofill-roadmap/04-form-fill-execution/README.md` — **B4 主文档，实施蓝图**（含核心产物清单、Overlay 注入示例代码、轮询逻辑、字段注入策略参考）
4. `local-docs/browser-autofill-roadmap/03-form-recognition/README.md` — B3 完成记录，**特别注意末尾「完成记录」+「补丁：授权后自动续接」两节**；B4 要在 B3 写原语之上编排，必须理解已有能力面
5. `local-docs/browser-autofill-roadmap/02-page-context/README.md` — B2 完成记录，了解桥接模式（B3/B4 都是这套）

### 前置代码（B4 要复用/扩展）

**B3 写原语 + 闸门（B4 直接调用）**
- `src/browser/types.ts` — `BrowserPageOperator` / `FormElementSummary` / `WriteAccessCheck`（B4 需要的字段基础）
- `src/desktop/main/browser/browser-page-operator.ts` — 写原语实现（B4 不改，只用）
- `src/desktop/main/browser/browser-write-access-gate.ts` — 5min TTL 闸门；B4 若 Overlay 期间要阻拦新写入需在这层加"审核锁定"标志
- `src/desktop/main/browser/browser-content-writer.ts` + `browser-writer-scripts.ts` + `browser-writer-actions.ts` — 注入脚本范式，B4 的 Overlay 注入照此写
- `src/desktop/main/browser/browser-click-guards.ts` — 提交按钮判定（B4 不改，Overlay 期间仍应生效）
- `src/tools/browser/*` — 7 个写工具（B4 不新建 `browser_*` 写工具）

**审批与续接模式（B4 参考）**
- `src/browser/write-access-approval.ts` + `src/browser/browser-write-access-executor.ts` — 复用 ApprovalManager 的样板
- `src/desktop/main/browser-write-access-continuation.ts` — **审批后自动续接 Agent 的关键机制**；B4 若要做「范围预审卡接受后自动开始填写」需照抄
- `src/desktop/main/jd-continuation.ts` — 更老的 continuation 参考
- `src/actions/create-action-approvals.ts` — 注册新 action executor 的入口
- `src/desktop/main/agent-runtime.ts` — `resolveApproval` 里挂 continuation 的位置

**桥接链路（B4 若要新增 IPC 参考此）**
- `src/desktop/main/index.ts` → `src/desktop/main/ipc.ts` → `agent-runtime.ts` → `src/tools/registry.ts`
- `src/desktop/main/browser/browser-ipc.ts` + `browser-ipc-channels.ts` — 浏览器专用 IPC

**渲染进程侧（B4 要加填写进度面板）**
- 已有的对话面板结构：`src/desktop/renderer/src/` 下随便找一个 Composable + 组件对（如 approval 卡片相关）作为范式
- `src/desktop/shared/types.ts` — `DesktopAgentEvent` 联合类型；B4 加 `browser:fill-progress`/`browser:review-*` 事件时在这里补

---

## 第二步：B4 要交付什么（沿用主文档，核心节选）

### 主要产物

**主进程新文件**（`src/desktop/main/browser/`）
- `browser-overlay-injector.ts` — 注入遮罩 + 每个 fillId 旁的 ✓/✗ 徽章 + 顶部工具栏；挂载 `window.__fillReview`
- `browser-overlay-poller.ts` — 每 300ms 轮询 `window.__fillReview`；检测到 `globalAction` 后执行保留/还原 + 移除 Overlay + 推 `browser:review-complete`
- `browser-captcha-detector.ts` — 识别 reCAPTCHA/滑块/图形验证码，推 `browser:captcha-detected` 通知 Agent 暂停

**审批 action**（复用 ApprovalManager）
- 范围预审卡 action（FillConfirmCard 语义）：用户在开始批量写入前一次性确认「要填的字段范围 + 拟写入的示例值」；接受后 Agent 才批量调 B3 写原语
- 授权后自动续接（照 B3 那套 continuation 复制一份）

**渲染进程新文件**（`src/desktop/renderer/src/`）
- `components/FillProgressPanel.vue` — 实时字段状态面板
- `browser/use-fill-progress.ts` — 订阅 `browser:fill-progress` 的 composable

**IPC 通道新增**（`browser-ipc-channels.ts`）
- `browser:fill-progress`（主→渲染）
- `browser:review-decision`（主→渲染）
- `browser:review-complete`（主→渲染）
- `browser:captcha-detected`（主→渲染）
- `browser:abort-fill`（渲染→主）

### Overlay 关键规则（B0 已定，别自行改）

- **单个 ✗ 拒绝** = 清空字段值（不还原原始）
- **全部接受** = 只接受未被单独拒绝的（已拒绝的保持清空）
- **全部拒绝** = 还原所有字段（含已单独接受的）
- **解锁条件** = 所有写入点都已决定（不要求点全局按钮，逐个点完也解锁）
- **锁定期间**：浏览器所有表单交互被屏蔽，尤其**禁止点提交/发送**；主进程拒绝新的写请求（B3 闸门要加一个"reviewing"锁）
- **Agent 永不点提交/发送**（B3 已实现的 click-guards 仍生效）

---

## 第三步：已就绪的能力（B4 别重复造）

- ✅ 写权限闸门（含 5min TTL、tab+origin 绑定、切走暂失效、改 origin 硬收回）
- ✅ `browser_tag_elements` 打稳定 `data-fill-id`
- ✅ 5 个写原语（fill/select/set_checked/click/scroll）+ React/Vue 受控组件兼容
- ✅ `browser_click_element` 提交按钮双闸拦截
- ✅ 授权后自动续接 Agent 的模式（`browser-write-access-continuation.ts`）
- ✅ ApprovalManager 弹审批卡的完整链路

---

## 第四步：验证与收尾

- 全量校验：`npm run check`（typecheck → desktop:typecheck → test → build → desktop:build）
- 主进程 Electron 模块无法在 `node --test` 跑，靠类型检查 + 真实 Electron 手动验收
- **新文件 ≤ 250 行**（B3 最大 244 行，够了；B4 的 overlay 注入脚本要小心，可考虑像 B3 那样拆 `browser-overlay-scripts.ts` 单独放脚本）
- 完成后把实施记录写回 `local-docs/browser-autofill-roadmap/04-form-fill-execution/README.md`（追加"完成记录"节，别新建 section）
- 不要 commit，除非用户明确要求

---

## 第五步：待与用户确认的设计取舍

**这些点 B4 主文档没定死，动手前先问用户**：

1. **范围预审卡的粒度**：是「一次卡片列出所有拟填字段+示例值等用户批准整批」，还是「继承 B3 已有的写权限闸门，跳过预审直接开填，只依赖事后 Overlay」？B4 主文档倾向前者，但和 B3 已实现的写权限闸门有重叠——**这一点最容易设计撞车，一定要问**。
2. **Overlay 锁定与 B3 闸门的关系**：Overlay 期间应把 B3 闸门置为 `reviewing` 拒绝所有新写入，还是新增独立的锁定状态？倾向前者（改 gate 加一个模式位）。
3. **审批期间用户切标签怎么办**：B3 是"暂失效可恢复"，Overlay 期间是否要禁止切走？倾向不禁止，用户切走再切回 Overlay 仍在，锁定仍然生效。
4. **验证码检测触发时机**：轮询检测（B4 文档写的 pointer-events 检测特征）还是等 Agent 遇到失败后主动上报？倾向前者。
5. **FillProgressPanel 位置**：填写期间应显示在主窗口对话面板右侧，还是浮在浏览器窗口内？倾向主窗口，与聊天并列。
6. **中止填写行为**：`browser:abort-fill` 触发时是否清空已填字段？还是保留待用户手动清？B4 主文档没写。
7. **文件上传**：B3 已明确不做（归 B5）；B4 遇到 `input[type=file]` 时应标记 skipped 并提示，不要强填。

---

## 重要提醒

- 遇到设计取舍先问用户再动手（AGENTS.md 第一条）
- 页面 label/文本一律不可信数据（B2/B3 已有的标注模式延续下去）
- Overlay 是页面内注入 DOM，也可能被网站的 CSP/frame busting 影响——**发现问题及时问用户是否可以降级**（比如某站点无法注入 Overlay 时是否允许改用主窗口面板逐条确认）
- B3 已经用 `browser-write-access-continuation.ts` 建好了「审批通过→自动续 Agent」的模式，B4 复用同一套写法，别自己发明新机制
- 先给用户一个 B4 实施计划 + 上述 7 个待确认问题，对齐后再写代码
