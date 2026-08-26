# P1：Electron 桌面简历附件接入

> 状态：已完成并通过质检  
> 前置：P0 通过

## 实施计划

> 计划日期：2026-07-24

### P1.1 受控文件 Registry

- 把可预测序号 ID 改为随机 attachment ID；
- 注册先完整校验类型、普通文件和 20 MB 上限，再原子写入 Registry；
- 增加单项移除、整体释放和“一次一份”的原子替换；
- 记录选择时的文件身份，读取前拒绝路径失效或选择后被替换的文件；
- 保持 Renderer 永远拿不到绝对路径。

### P1.2 对话级生命周期与 Agent 复用

- 为每个登录用户建立一个 conversation → `SelectedFileRegistry` 容器；
- Desktop Agent 创建上下文时注入该对话已经注册的同一个 Registry；
- 对话删除时释放该对话附件，退出登录时释放当前用户全部附件；
- 切换对话时附件互相不可见，取消一次 Agent run 不删除附件，允许用户修正后重试。

### P1.3 Electron IPC 与安全桥

- 主进程通过 `showOpenDialog` 选择单个 PDF/DOCX/TXT/MD；
- IPC 输入只接受 `conversationId/fileId`，不接受 Renderer 提交的路径；
- Preload 只暴露 `select/list/remove` 和安全元数据；
- 取消选择返回空结果，格式、大小、路径异常返回可读错误。

### P1.4 Composer 与状态反馈

- 启用回形针的点击/键盘路径；
- Composer 显示单个填充式附件条、文件名、大小、“仅本机”、移除按钮；
- 状态覆盖已选择、解析中、已解析、部分写入、已保存和失败；
- 选择成功后预填“请解析并导入这份简历中的经历”，但不自动发送；
- `parse_selected_file` 与 `experience.import` 事件驱动状态，不复制 ToolActivity 或
  ApprovalCard。

### P1.5 测试与真实验收

- Registry：随机 ID、原子替换、类型/大小限制、路径失效/替换、跨对话隔离和释放；
- IPC/Preload：取消、安全参数、元数据无路径、对话删除和退出登录清理；
- Renderer：切换对话、选择/移除、解析成功/失败、accept/reject/custom/部分失败状态；
- 回归：CLI TXT/MD/DOCX/PDF、本地 Agent 导入、Action Approval 与 App 全量门禁；
- Electron：真实系统选择器完成至少一次 DOCX/PDF 导入，并验证 App 创建经历可由 Web 读取。

## 已有能力，不重复建设

### Web + 后端

```text
Web 文件选择
→ POST /v1/files/upload
→ POST /v1/files/{fileId}/parse
→ clientState.resumeFileId
→ 后端 experience import graph
→ 候选确认
→ 经历入库
```

该链路已经存在，本阶段不重写、不迁移，也不让桌面 App 调用后端 LangGraph。

### App Core + CLI

```text
CLI --attach
→ SelectedFileRegistry
→ list_selected_files / parse_selected_file
→ prepare_experience_import
→ 宿主审批
→ ExperienceImportExecutor
→ 经历入库
```

解析器已经支持 PDF、DOCX、TXT、MD，Proposal、去重、审批和 Executor 也已经存在。

## 实施前缺口（已关闭）

- Electron Composer 回形针原为 disabled，现已启用；
- 原先没有 `showOpenDialog` 附件 IPC，现已由主进程提供；
- DesktopAgentRuntime 原先创建不可达的 SelectedFileRegistry，现已复用对话级同一实例；
- Renderer 原先没有附件条、解析状态、移除和失败反馈，现已补齐；
- CLI 已有的本地导入链路现可由桌面 App 用户触发。

## 本阶段实施链路

```text
点击 Composer 回形针
→ Electron showOpenDialog
→ 主进程校验并注册到当前用户/对话的 SelectedFileRegistry
→ Renderer 只接收受控元数据
→ 用户发送“解析并导入这份简历”
→ App Agent 调用现有 parse_selected_file
→ 现有 prepare_experience_import
→ 宿主显示候选审批
→ 接受后写入云端经历
```

## 实施内容

### Electron 与生命周期

- `showOpenDialog` 是桌面选择简历附件的唯一入口；
- 支持 PDF、DOCX、TXT、MD，附件上限为 20 MB；
- 主进程持有绝对路径，Renderer 只拿随机 ID、名称、类型和大小；
- Registry 按登录用户和对话隔离；移除、对话销毁、退出登录时释放；
- DesktopAgentRuntime 必须复用已注册 Registry，不能每次运行创建不可达的新实例。

### Agent 与导入

- 继续使用 `list_selected_files`、`parse_selected_file` 和 `prepare_experience_import`；
- 不增加第二套解析器、Proposal 或写入工具；
- 不调用 `/copilot`、后端 experience graph 或云端 LangGraph；
- 原文件默认仅本机，接受候选只保存结构化经历；
- 用户拒绝后不写经历；自定义修改继续替换完整 Proposal。

### UI

- 启用现有 Composer 回形针；
- Composer 上方显示填充式附件条、名称、大小、“仅本机”、移除和解析状态；
- 解析/审批继续复用 ToolActivity 和 ApprovalCard；
- 文件选择和拖放都必须有键盘/点击路径；首版一次一份，保持与 Web 当前限制一致。

## 关键失败场景

- 取消选择；文件超限、损坏、加密 PDF、扫描 PDF、空文档；
- 路径失效或文件在选择后被替换；
- 对话切换、删除、退出登录和 Agent 取消；
- 解析文本包含 prompt injection；
- 候选部分写入失败时精确重试，不重复已保存经历。

## 本阶段不做

- 重写 Web/后端已有上传解析链路；
- 把 App 原始简历自动上传云端；
- 通用材料库、图片附件、经历素材关联或未归类素材；
- OCR。

## 完成门槛

- Electron 用户能从回形针完成一次 PDF/DOCX 简历导入；
- TXT/MD 解析回归通过，扫描 PDF 明确提示不支持 OCR；
- accept/reject/custom 与现有 CLI 行为一致；
- Renderer 无法获取或提交任意本地路径；
- App 创建的经历可被 Web 读取；
- CLI `--attach`、Web 上传链路和现有经历导入测试全部不退化。

## 实施结果

> 完成日期：2026-07-24

- 主进程通过系统 `showOpenDialog` 只接受一份 PDF、DOCX、TXT 或 Markdown；Renderer 只能提交
  `conversationId/fileId`，也只能读取不含路径的随机 ID、名称、类型和大小；
- `ConversationSelectedFiles` 按对话持有 Registry，并把同一实例注入
  `DesktopAgentRuntime`；替换、对话删除和退出登录都有明确释放路径；
- Registry 已实现随机 ID、注册前完整校验、原子替换、20 MB 上限和文件身份前后校验；
- Composer 已实现“仅本机”附件条、大小、移除、解析/部分写入/已保存/失败状态，并继续复用
  现有 ToolActivity、ApprovalCard、Proposal 和 Executor；
- 自动化覆盖随机 ID、无路径元数据、原子替换、超限、文件变更、对话隔离、DOCX 解析、
  无文本 PDF/OCR 提示和附件事件状态机；
- `npm run check` 通过：103 项测试全部通过，核心与桌面类型检查、核心构建和 Electron 构建
  均通过；新增无文本 PDF 用例另行通过后，最终测试总数为 104；
- 浏览器实测通过浅色/深色、选择/移除和 940×720 最小窗口，无横向溢出；
- 真实 Electron 使用系统选择器导入匿名 DOCX，Agent 提取 1 条经历，宿主接受后显示
  “经历已保存到云端”；随后使用 Web 共用的公开 API Client 读回同一条 active 经历；
- 2026-08-26 用户确认附件上限由 10 MB 提升到 20 MB。回归锁定 20 MiB 可注册、20 MiB+1 byte
  原子拒绝；真实 Electron 重新选择并提交 12,188,401 bytes（11.62 MiB）的 SiC PDF，界面依次显示
  “已选择→解析中→已解析”，`parse_selected_file` 与 `add_resume_material` 成功，东吴证券工作区新增
  文件中的市场测算、价值链方法与重点公司证据。旧会话 `exp_10` 短引用失效后 Agent 通过重新检索恢复；
  后续简历尾行在 14→8 时触发模型停滞保护，属于独立生成稳定性问题，不回退附件验收结论。最终
  `npm run check` 全绿：742 个源文件均 ≤250 行、650/650 tests、全部 typecheck/build 通过；
- 后续同一 11.62 MiB PDF 在主进程热重启后反复重新选择，均能再次进入“已选择→解析中→已解析”。旧会话
  顺序短引用已改为跨重启稳定派生 ID，避免补材调用在重启后指向错误经历。附件中的新证据现可由尾行改写用
  `additionalEvidenceIds` 明确绑定到目标 bullet，不再只存入 workspace 却无法进入内容校验。完整 `npm run check` 更新为
  744 个源文件行数门禁、656/656 tests 和全部 typecheck/build 通过。
- 验收使用的随机账户不记录密码，App 已退出登录；临时 DOCX、渲染文件、凭据和验收脚本已删除。

## 已知边界

- P1 不实现 OCR；无可提取文本的 PDF 会明确提示“扫描版 PDF 暂不支持 OCR”；
- 原始附件不会自动上传云端，云端只保存用户批准后的结构化经历；
- Web 自己的上传解析链路保持不变，本阶段没有修改后端或 Web 文件 contract。
