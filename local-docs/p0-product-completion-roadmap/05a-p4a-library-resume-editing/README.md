# P4A：简历仓库编辑与对话附件

> 状态：✅ 完成
> 前置：P4 简历仓库完成

## 目标

补全简历仓库的"打开 → 编辑"链路，并支持在对话中附带已有简历。

---

## 方向一：从仓库打开简历进入编辑（P4A.1）

**用户流程：** 简历仓库网格 → 点击某份简历 → 关闭仓库 → 切回聊天视图 → 右侧 ArtifactPanel 自动加载该简历

**实现要点：**
- `ResumeLibraryView` emit `open(entry)` → App.vue 关闭 library、调用 `openResumeDraft(artifactId)`
- 如果简历有关联对话则切换到该对话，没有则新建对话
- cloud_only 简历（无本地草稿）需先拉取云端内容创建本地草稿再打开
- 编辑体验与从侧栏选中本地简历完全一致

**改动范围：**
- `App.vue`：接收 open emit，组合 libraryOpen=false + openResumeDraft
- `ResumeLibraryView.vue`：open emit 传递 entry
- `use-resume-workspace.ts`：可能需要处理 cloud_only → 创建本地草稿的逻辑

---

## 方向二：对话中附带已有简历（P4A.2）

**用户流程：** 在聊天输入框旁点击"+"或附件按钮 → 弹出选择器 → 从已有简历/草稿中选择 → 作为上下文附带到下一条消息

**实现要点：**
- 复用简历仓库的数据源（library.list）
- 选择器可以是弹出式列表或小型网格
- 选中后在 Composer 区域显示附件标识
- 发送消息时将选中简历作为 ResumeChatReference 传入

**实现计划：**

现有机制分析：
- Composer 已有 `ResumeChatReference` 支持（拖拽/点击从 ArtifactPanel 引用）
- `selectReference()` 设置引用后 Composer 显示"简历引用"chip
- `publishResumeReference()` / `subscribeResumeReference()` 是现有的 pub/sub 通道
- 回形针按钮（Paperclip）目前触发文件附件选择（`selectAttachment` → 文件选择器）

步骤：
1. **P4A.2a** — `ResumePickerPopup.vue`：弹出式选择器组件，调用 `desktopApi.library.list()` 加载简历列表，点击某项后 emit `select(reference)`
2. **P4A.2b** — Composer 增加"选择已有简历"按钮（`Plus` 图标），点击后显示 `ResumePickerPopup`
3. **P4A.2c** — 选中简历后调用 `selectReference()` 设置引用，复用现有 chip 展示和发送逻辑
4. **P4A.2d** — Browser Demo 验证

**不改动：** `use-conversation-attachment`（文件附件通道不变）、`ResumeChatReference` 类型不变

---

## 执行顺序

1. ~~方向一（从仓库打开简历）~~ ✅ 完成
2. ~~方向二（对话中附带简历）~~ ✅ 完成
