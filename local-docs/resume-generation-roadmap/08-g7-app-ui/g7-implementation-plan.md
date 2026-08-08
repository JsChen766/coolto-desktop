# G7 App 前端实施计划

> 状态：已完成并通过首轮质检  
> 日期：2026-07-24  
> 产品约束：[G7 产品与实施计划](./g7-product-plan.md)

## 1. 实施目标

在不改变 Web/App 共享 `Resume` / `ResumeVariant.structured` 契约的前提下，将 G1–G6 能力
接入桌面 App，交付可恢复、可编辑、可与 Agent 协作、可确认 AI 修改、可本地回退并可主动
保存到云端或导出 PDF 的 A4 简历工作区。

## 2. 模块边界

### 2.1 纯业务层

`src/resume/draft/`：

- `types.ts`：本地草稿、检查点、Artifact、待决策修改契约；
- `projection.ts`：在 Workspace 与可持久化草稿之间创建、更新、检查点投影；
- `manual-editor.ts`：按稳定 ID 修改叙述字段并使旧质量报告失效；
- 检查点策略由草稿服务集中执行：自动保存不建版本，失焦、接受 AI 修改和恢复才建版本。

### 2.2 Electron 主进程

`src/desktop/main/resume-drafts/`：

- 加密、原子写入的本地草稿仓库；
- 与对话隔离的草稿生命周期；
- 草稿列表、读取、自动保存、接受/拒绝、检查点恢复；
- Candidate Workspace 与草稿之间的同步协调器。

聊天删除只删除 `ConversationStore` 记录，不调用草稿删除。

### 2.3 桌面桥接

`src/desktop/shared/` 与 preload/IPC：

- 只暴露受控的草稿 ID、结构化编辑动作和恢复动作；
- 不暴露本地文件路径；
- Agent 工具完成后推送草稿/提案状态事件；
- 保存到云端和导出继续复用现有 Action Approval。

### 2.4 Vue Renderer

`src/desktop/renderer/src/resume-workspace/` 与 `components/`：

- `useResumeWorkspace.ts`：UI 状态与 IPC 调用；
- A4 DOM 渲染适配器：复用现有模板，不复制第二套简历 HTML；
- 可编辑字段、固定字段锁定提示、拖拽引用、绿色荧光笔差异高亮；
- 高级详情、本地自动保存状态、本地版本列表、接受/拒绝栏；
- 聊天 Artifact 卡片与左侧栏本地简历入口。

`src/desktop/renderer/src/chat/use-chat-session.ts` 独立承担对话、运行事件和审批状态，避免把
这些职责继续堆入 `App.vue`。

`App.vue` 只负责选择对话、展开 Canvas 和组合组件，不直接承担草稿存储、排版编译、版本
策略或 AI 提案状态机。

## 3. 数据状态

```text
Agent ResumeWorkspace
        │ 工具完成/手动编辑
        ▼
LocalResumeDraft.current ──────> 自动加密保存
        │ 有意义动作
        ├──────────────────────> LocalCheckpoint[]
        │ AI 定向修改
        └─ base + proposed ────> PendingChangeProposal
                                   ├─ 接受：proposed 成为 current + checkpoint
                                   └─ 拒绝：base 恢复为 current

用户点击“保存/更新到云端” ──Action Approval──> Cloud Resume 当前内容
用户点击“导出”       ──Action Approval──> 本地 PDF 文件
```

G5 内部仍通过 staged variant、verify 和 accept 完成原子发布，但该 token 不是 G7 用户可见的版本实体。

## 4. 视觉实施规则

- 复用 `tokens.css`、`base.css`、现有按钮、popover、圆角、间距和 Lucide 图标；
- 新卡片和区域采用“填充式”或“描边式”之一，禁止背景与边框同时可见；
- AI 修改只使用低透明度绿色文字荧光笔，不使用边框；
- A4 纸张保持白色、真实宽高比和现有纸张阴影，外围随深浅主题变化；
- 编辑覆盖物不参与测量和 PDF；
- 窄窗口优先收起 Canvas，不压缩 A4 内容造成伪换行。

## 5. 实施顺序

### G7.1 本地草稿基础

状态：完成。

- 定义本地草稿和 Artifact 契约；
- 实现加密原子仓库与检查点策略；
- 扩展 Conversation 保存 Artifact 引用；
- 单测覆盖原子保存、用户隔离、删除聊天保留草稿和恢复。

### G7.2 Agent/Workspace 同步

状态：完成。

- 每个对话保存 Agent、WorkspaceStore 与草稿同步上下文；
- prepare/patch/review 完成后自动保存工作稿并通知 UI；
- 打开本地草稿时恢复 Workspace；
- 定向 AI 修改保存 base/proposed，支持接受/拒绝。

### G7.3 桌面 API

状态：完成。

- 增加 drafts list/get/update/checkpoint/restore/accept/reject IPC；
- 增加 resume draft 事件；
- 浏览器预览 API 提供真实结构化 demo 数据，支持视觉开发。

### G7.4 可编辑 Canvas

状态：完成。

- 复用 `renderResume` 和模板 CSS；
- 自适应缩放 A4，不改变真实 DOM 排版；
- bullet/技能编辑、固定字段锁定解释和聊天修改入口；
- 拖拽 bullet/经历到 Composer 生成结构化引用。

### G7.5 工具栏、详情与版本

状态：完成。

- 展开后同一行提供高级详情、保存到云端、导出和收起；
- 高级详情只显示页面占比、最低尾行、事实完整性和 JD 覆盖；
- 本地版本入口、恢复检查点和本地/云端状态教育；
- Canvas 底部接受/拒绝栏。

### G7.6 视觉与交互验收

状态：完成；结果见 [G7 实施结果](./g7-implementation-result.md)。

- 浅色、深色和窄窗口视觉检查；
- 卡片背景/边框互斥审计；
- A4 编辑态与隐藏 renderer 的关键布局对比；
- 自动保存、异常恢复、聊天删除、历史聊天恢复、接受/拒绝和本地回退实测；
- 全量 typecheck、test、build 与 Electron Chromium QA。

## 6. 完成门槛

- 本地草稿在异常退出后可恢复，且删除聊天不会删除草稿；
- 历史聊天 Artifact 和左侧栏均可打开草稿；
- 直接编辑仍使用同一 `structured` 和模板；
- 固定字段尝试编辑时有原因说明和聊天入口；
- AI 修改可预览、接受和拒绝，绿色高亮不改变排版；
- 本地版本回退不产生任何云端写入；
- 用户能持续区分本地草稿、云端当前内容和导出文件；
- 新业务模块职责单一，`App.vue` 不形成上帝组件；
- G1–G6 回归与 G7 新增测试全部通过。
