# 基础与总设计

本目录保存 P0 产品能力补齐路线的跨阶段约束。阶段目录只能补充实现细节，不能绕过这里的
数据权威、Agent 边界、审批和 UI 规范。

## 文档

- [产品范围与架构](./product-scope-and-architecture.md)
- [UI 设计规范](./ui-design-standards.md)
- [总实施计划](./implementation-plan.md)
- [完整产品 PRD](../../resume-generation-roadmap/00-foundation/coolto-prd.docx)
- [既有 App 架构](../../resume-generation-roadmap/00-foundation/coolto-architecture-plan.md)
- [既有 G7 产品规范](../../resume-generation-roadmap/08-g7-app-ui/g7-product-plan.md)

## 决策优先级

冲突时按以下优先级处理：

1. 用户在当前路线中明确确认的决策；
2. 云端固定资产和安全边界；
3. 简历生成 G1–G7 已通过的契约与质量门；
4. 本目录的跨阶段规范；
5. 单个阶段的局部实现计划。

## 云端同步基础设施接入记录（2026-07-27）

- APP 已建立持久化设备 ID、Electron SQLite `LocalSyncStore`、Outbox、
  Bootstrap/Pull 原子页写入、冲突/失败留痕和单实例 Sync Worker；
- 同步业务 payload 使用 AES-256-GCM，随机数据密钥仅以 Electron
  `safeStorage` 包装后的形式落盘；系统安全存储不可用时拒绝打开同步库；
- 登录和恢复 Session 后按当前用户与设备启动 Worker，退出和窗口关闭时停止；
  401 会暂停定时同步并等待重新登录；
- Profile 是首个协议参考切片。Experience、JD、Resume、Application 现有业务
  Adapter 尚未切换到 LocalSyncStore，不能将“离线业务同步”标记为完成；
- `npm run check` 已通过：181 个既有测试、Node/Vue 类型检查、Node build 和
  Electron production build 全部成功；
- 新增同步职责按 API、Worker、Store、Outbox、远端页写入、密钥和加密 codec
  分离，所有业务文件低于 250 行，未引入同步上帝类。

## 新后端现有 API 契约收口（2026-07-27）

- Experience/JD 的现有 Create Adapter 已发送 `Idempotency-Key`：审批执行复用稳定的
  proposal/candidate 标识，其他兼容调用使用随机 UUID；
- Experience/JD/Resume 类型与运行时 Normalizer 已接收新后端的
  `entityVersion/deletedAt`，Resume 同时接收 `targetCompany`；
- Resume 重命名、归档和恢复在 PATCH 前读取当前云端文档，并提交 `expectedVersion`；
  Resume Replace 继续使用审批 payload 内稳定的 `expectedContentHash`，避免重试时请求 hash 漂移；
- 只修改 APP 已存在的 Experience/JD/Resume 调用面；未新增 Application、Interview、Note、
  Reminder Adapter/UI，也未声称 Tracker APP 联调完成；
- `npm run check` 通过：181/181 tests、Node/Vue 类型检查、Node build 与 Electron
  production build 全部成功；现有本地存储、对话、Resume Draft 和 checkpoint 未改变。
- 真实联调已直接使用 APP `CooltoApiClient` 连接本地 Docker 后端：开发登录、Experience/JD
  创建与读取、Resume 发布/列表/重命名/归档均成功；联调资产随后通过软删除清理。当前证据覆盖
  API Adapter，不等同于尚未实现的 Tracker UI 或正式 OTP UI 验收。
