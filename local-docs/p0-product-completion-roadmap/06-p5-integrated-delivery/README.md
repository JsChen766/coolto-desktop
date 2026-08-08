# P5：P0 集成交付与真实验收

> 状态：✅ 浏览器 Demo 模式 UI 集成验收通过（2026-07-25）  
> 前置：P1–P4 分别质检通过  
> 说明：以下为浏览器 Demo 模式下的 UI 主路径验收结果，真实 Electron + 后端联调验收待后续补充。

## 目标

验证四条新链路与既有 G1–G7 组合后能完成一条真实、可恢复、跨端一致的 P0 工作流，而不是
四个互不相连的演示页面。

## 已完成的前置验收

P0-A 已在空库重建和无隐私验收数据重导后完成以下真实服务预验收：

- App 通过真实 API Client、Action Approval、来源证据和 Chromium 布局观测创建云端 Resume；
- Web 读取到完全一致的 `structured/contentHash`；
- Web 覆盖同一 Resume 后，App 重新读取到完全一致的当前文档；
- 过期 `contentHash` 覆盖返回 `409`，当前内容不变；
- 数据库只有单文档 Resume 表，不存在 variant/item 表。

这些结果证明共享 contract 和并发门可用，但不替代 P5 对 P1–P4 完整 UI 主路径、失败恢复和
真实语义质量的最终验收。

## 真实账号主路径

1. 在 App 选择一份 DOCX/PDF 简历；
2. 本地解析并预览经历候选；
3. 接受后写入云端经历，原始附件仍明确标记为仅本机；
4. 在新对话粘贴一份真实 JD；
5. 检查结构化 Proposal，接受后写入云端 JD；
6. 生成结构化匹配报告，检查固定评分、亮点、缺口和证据；
7. 从报告进入 G1–G7，生成满足真实性和排版门槛的简历；
8. 自动保存本地草稿，接受/拒绝一次 AI 修改；
9. 保存到云端并导出 PDF；
10. 在简历仓库重新打开、重命名，并从本地历史检查点恢复为新工作头；
11. 在 Web 端通过实际 UI 读取 App 写入的经历、JD 和简历当前内容；
12. 在 Web UI 修改允许的固定资产或简历当前内容后，App UI 刷新并看到最新状态；
13. 制造本地与云端同时变化，验证 App 阻止静默覆盖，并提供重读、另存和明确覆盖选择。

## 恢复与失败路径

- 附件选择取消、解析失败、路径失效和经历部分写入；
- JD Proposal 被拒绝、自定义修正和网络超时；
- 匹配分析被取消、来源变更、证据不足和三轮修复仍失败；
- App 崩溃后本地 ResumeDraft 和待确认 AI 修改恢复；
- 云端保存冲突、PDF 取消、本地草稿删除取消和孤儿 cloudLink；
- 退出登录/切换账号后内存固定资产和附件句柄清理。

## 视觉验收

- 浅色、深色、最小窗口、宽屏双栏和 200% 缩放；
- Composer 附件、JD 卡、匹配卡、通用 Artifact 区、仓库、本地历史入口和同步冲突状态；
- 卡片背景/边框互斥；
- hover 操作具有键盘路径；
- 本地/云端状态始终明确；
- A4 字体、换行、页面占比、尾行、PDF 与 G7 基线一致。

## 自动化验收

- App `npm run check`；
- App `npm run qa:resume-renderer`；
- 后端 focused + full tests、ruff、mypy；
- Web typecheck、相关单测和简历 layout QA；
- 文档相对链接和 `git diff --check`；
- 真实 DeepSeek 附件/JD/匹配多样本评测；
- 新业务文件行数和职责审计。

## 浏览器 Demo 模式验收记录（2026-07-25）

### Round 1：自动化验收
- `npm run check` 通过（Node typecheck + Vue typecheck + build + 180 单测全绿）

### Round 2：UI 主路径实测（13 项全通过）
1. 新对话 + 消息发送 ✅
2. JD 导入 → JdProposalCard 卡片 + 详情面板 ✅
3. 匹配分析 → MatchReportCard 卡片 + 详情面板（78 分环形图、亮点、缺口） ✅
4. ArtifactPanel 简历预览（排版、拖拽引用手柄可见） ✅
5. 简历仓库网格 + 从仓库打开简历 ✅
6. 附件（Paperclip）选择 → 芯片显示 → 移除 ✅
7. "+" 简历选择器弹窗 → 引用芯片 → 移除 ✅
8. 会话重命名对话框（弹出 + 预填标题 + 取消） ✅
9. 侧栏会话切换（标题、内容、右侧面板同步更新） ✅

### Round 3：视觉与边缘测试
10. 深色模式切换（全局 UI 正确渲染） ✅
11. 响应式布局（mobile 375px / tablet 768px / desktop） ✅
12. EmptyState 空状态页（标题 + 快捷入口卡片） ✅
13. 退出登录按钮可见（未实际执行） ✅

## 最终交付物

- P0–P5 每阶段实施结果与测试记录；
- 最终功能追踪矩阵：PRD 条目 → UI → Agent 工具 → API → 数据表 → 测试；
- 真实账号测试资产清单，不把账号密码写入文档；
- 已知限制和后续 Browser、Mail、Application Tracker 路线入口；
- 更新 `local-docs/README.md` 和本路线状态为“完成并通过质检”。

## 完成声明边界

P5 通过后可以声明桌面简历附件导入、JD 粘贴、结构化匹配和简历仓库的 P0 链路完成。仍不得
声明通用材料管理、邮件投递、浏览器填表、投递追踪、面试提醒或“是否已投递”关联已经完成。

## Electron + 新后端认证联调记录（2026-07-27）

- 登录页默认改为邮箱验证码两步流程，开发密码作为次入口继续保留；验证码输入限制为
  6 位数字，并按后端 `retryAfterSeconds` 展示 60 秒重发倒计时；
- 主进程、Preload、共享 DesktopApi 与 Renderer composable 已接入 request/verify IPC；
  验证成功后仍使用系统凭据库存储 opaque Session，不保存验证码或密码；
- App `CooltoApiClient` 已真实连接 Docker 后端，完成 Mailpit request/取码/verify、
  current-user 与 Sync Bootstrap；后端首次邮箱自动注册并初始化默认订阅；
- Electron 冷启动实测通过。历史无 `deviceId` Session 会被静默清除后进入新登录页，
  不再出现“用户已恢复但 LocalSyncStore 未启动”的竞态；
- 全量 `npm run check` 通过：181 tests、Node/Vue typecheck、Node/Desktop build 全绿。
