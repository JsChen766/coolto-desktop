# G1：来源快照和证据门禁

> 状态：已完成  
> 完成日期：2026-07-23

本阶段使用现有普通业务 API，把用户资料、JD 和经历 `currentRevision.content` 组合成
一次生成任务不可变的 `ResumeSourceSnapshot`，并建立 bullet 到精确原文 quote/offset 的
evidence ledger。后端 Fact Bank 不是依赖。

详细计划见：[G1 实施计划](./g1-implementation-plan.md)。

G3 前置复检见：[G1/G2 质量加固计划](../00-foundation/g1-g2-quality-hardening-plan.md)。

上游依赖：

- [G0 契约和回归基准](../01-g0-contract-and-regression/README.md)
- 现有 App 登录 session、用户和经历只读 API

下游消费者：

- [G3 本地生成闭环](../04-g3-local-generation-loop/README.md)
- [G4 质量与局部修复](../05-g4-quality-and-repair/README.md)
- [G5 保存和跨端互通](../06-g5-save-and-cross-client/README.md)

## 完成结果

- App API client 已支持 profile、JD 列表与详情，并对新响应执行运行时契约解析；
- snapshot 锁定认证用户、JD content hash、经历 current revision/content hash 和模板 profile；
- 相同来源在不同抓取时间产生相同 source fingerprint；
- evidence ledger 校验经历/revision/hash、UTF-16 offset、精确 quote、requirement ID、范围
  重叠和无来源数字；
- 新增 `get_user_profile`、`search_jds`、`get_jd`、`get_resume_source_snapshot` 只读工具；
- 真实账号 smoke test 成功锁定 21 条 JD requirements 和 7 条 active 经历；
- smoke test 未读取历史 revision 正文，未调用后端 Agent，未创建或修改任何业务资产；
- `npm run check` 通过，共 49 项测试。

真实账号验证发现 profile email 可为空，因此认证邮箱以 `/users/me` 为权威，profile 只提供
可选求职资料。凭据和 session token 未写入代码、文档或测试产物。

当前 evidence ledger 是生成 Workspace 的内存态校验结构，不改变 Web/App 共用的数据库
存储规范。G5 接入保存前必须先完成 quote/offset 证据与现有 `ResumeVariant.structured` 的兼容
映射和服务端复验设计。

G3 前置复检已完成：snapshot 选择顺序确定、经历运行时契约、canonical bullet ID 和瞬态
对话持久化策略均已补齐；全量检查和真实账号只读 smoke test 通过。

G3 已在此边界之上完成：所有生成 bullet 都必须绑定当前 snapshot 的精确 quote/offset，
candidate 工具结果也不会写入持久化对话。当前全仓回归为 63 项。
