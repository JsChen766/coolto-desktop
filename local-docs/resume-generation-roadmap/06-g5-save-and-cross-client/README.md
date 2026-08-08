# G5：保存和跨端互通

> 状态：已完成  
> 前置依赖：G4

> 2026-07-24 取代声明：本文记录历史 G5 实现；其中云端 variant、staged/verify/accept
> 发布内核已被 [P0-A 单文档重构](../../p0-product-completion-roadmap/01a-p0-single-cloud-resume-rebuild/README.md)
> 取代，不再是现行 contract 或后续实现依据。

计划产物：staged ResumeVariant、服务端复验、Action Approval、verify/accept/reject，以及
App 保存后 Web 可读取、Web 保存后 App 可读取的双向契约测试。

实施计划：[G5 保存审批与跨端互通实施计划](./g5-implementation-plan.md)。

实施结果：[G5 实施与验收记录](./g5-implementation-result.md)。

G5 已完成 `ready_for_approval → 本地审批 → staged → 服务端来源回放 → 浏览器布局复验
→ accept active`。用户接受前没有云端写入；App 和 Web 继续读取同一个
`ResumeVariant.structured`，没有引入 App 私有存储格式。

> G5 实施记录中的“版本”只描述当时实现。现行架构连内部 Resume variant 也不保留；
> 质量门改为写入前验证，成功后原子创建或覆盖唯一当前文档。

真实测试账号已创建一份带 `G5 LIVE QA` 前缀的测试简历并执行两次内部发布，第二次发布内容为 active；
Web 产品 API 与 App reader 读取的 active structured 完全一致。测试来源资产也使用相同前缀，
为保留验收证据未自动删除。
