# G1 来源快照和原文证据门禁实施计划

> 状态：已完成  
> 版本：v1.1  
> 日期：2026-07-23  
> 上位计划：[总实施计划](../00-foundation/coolto-resume-generation-implementation-plan.md)

## 1. 阶段目标

在不调用后端 LangGraph、不生成简历、不写 Resume/ResumeVariant 的前提下，让 App 能够
通过普通业务 API 取得一次生成所需的完整、版本化、可验证来源：

```text
用户选择 JD 与经历
  → 读取用户 profile
  → 读取 JD hash + 稳定 requirement IDs
  → 通过现有经历详情接口读取 currentRevision.content
  → 用 revision ID/hash 锁定原文版本
  → 校验经历归属、正文和版本
  → 冻结 ResumeSourceSnapshot
  → 初始化 EvidenceLedger
```

G1 完成后，G3 的 Pi Agent 只看到经过宿主校验的 snapshot，不直接拼接任意 API 响应。
每个 bullet 必须引用 snapshot 中当前 revision 的精确原文片段，不能引用 snapshot 之外的
经历正文或 JD requirement。

## 2. 当前代码与后端差距

已经存在：

- App：`GET /v1/users/me`、经历列表/详情和登录 session；
- 后端：`GET /v1/users/me/profile`；
- 后端：`GET /v1/product/jds` 与 `GET /v1/product/jds/{id}`，响应包含 `jdHash`、
  requirement IDs、权重和重要度；
- 后端：同一个经历详情响应已经包含 `currentRevision.content`、revision ID/hash 和历史
  revision 元数据，因此不需要新增 revision/facts 读取接口。

尚缺：

- App 的 profile/JD API types 与 reader；
- 将多次读取冻结为一个不可变 snapshot 的领域服务；
- stale revision、缺少正文、跨经历和无效 requirement 的失败关闭校验；
- bullet 到精确原文 quote/offset 的 evidence ledger。

## 3. 实现切片

### G1.1 冻结共享读取契约

定义并测试：

- `UserProfileSnapshot`；
- `JdSourceSnapshot` 和 `JdRequirementSnapshot`；
- `ExperienceRevisionSnapshot`；
- `SourceEvidenceExcerpt`；
- `ResumeSourceSnapshot`；
- `EvidenceLedger`、`BulletEvidenceBinding`；
- snapshot schema/version 和 deterministic fingerprint。

所有外部响应先解析、规范化，再进入领域对象。未知字段可以忽略，缺少必需字段必须失败。

### G1.2 扩展 App API client

增加：

- `getUserProfile()`；
- `listJds()` / `getJd()`；
- 对 camelCase 响应的严格 normalization；
- AbortSignal、认证错误和后端稳定错误码透传。

这些 reader 可以作为 Pi Agent 的只读工具，但 snapshot builder 使用宿主直接调用，避免模型
自行漏读关键来源。

### G1.3 构建不可变 ResumeSourceSnapshot

实现 `ResumeSourceSnapshotBuilder`：

1. 读取最新 profile 和指定 JD；
2. 按 ID 读取用户选择的经历详情；
3. 只接受 active 经历及其 `currentRevision`；
4. 校验 current revision ID 与经历的 `currentRevisionId` 一致；
5. 要求非空正文并计算 content hash；后端 revision hash 存在时一并锁定；
6. 校验 JD requirement ID 唯一且 hash 存在；
7. 规范排序后计算 snapshot fingerprint；
8. 深度冻结并返回结构化 diagnostics。

整个 snapshot 只存在当前本地任务内存，不写数据库和磁盘。

### G1.4 原文片段 Evidence Ledger 和确定性门禁

实现纯领域逻辑：

- bullet 至少绑定一个当前 revision 的原文片段；
- excerpt 必须属于 bullet 对应经历与精确 revision ID/hash；
- `sourceStart/sourceEnd` 必须是合法 UTF-16 offset，且切片结果与 `sourceQuote` 完全一致；
- requirement ID 必须属于当前 JD；
- 默认禁止同一或明显重叠的原文范围被多个最终 bullet 重复消费；
- bullet 中的数字必须出现在引用原文中；技术、责任范围和结果的进一步语义审计留给 G4；
- revision/JD/template fingerprint 任一变化后候选失效；
- 提供 `reserve`、`release`、`replaceBinding` 和 `validateCandidate`，不允许任意整表覆盖。

本阶段只实现门禁和账本，不让模型撰写 bullet。

### G1.5 Agent 只读工具与上下文投影

在现有单 Agent 工具注册表增加最小只读能力：

- 搜索/读取 JD；
- 读取 profile；
- 读取 snapshot 中允许的经历当前正文；
- 将完整 snapshot 投影成适合模型阅读、但保留稳定 ID 的紧凑上下文。

模型不能获取数据库内部字段、其他用户数据或 snapshot 之外的历史 revision。后端 Fact Bank
可以在未来作为 token/质量优化评估，但不是 G1 或生成正确性的依赖。

### G1.6 真实账号集成验证

确定性测试通过后，再使用用户提供的测试账号进行一次只读验证：

- 登录并复用现有安全 session；
- 读取 profile、JD 和经历；
- 如果账号有 JD 和带 current revision 的经历，构建真实 snapshot；
- 如果缺少 JD、经历或当前正文，只记录结构化缺口，不创建或修改任何云端数据；
- 日志和测试产物不得包含密码、session token 或完整敏感经历正文。

## 4. 测试矩阵

### App 单元测试

- API response normalization；
- snapshot 排序和 fingerprint 确定性；
- clone/freeze 后不可被调用方修改；
- 空 profile、空 JD、空经历、缺少 current revision；
- duplicate experience/requirement IDs；
- revision ID/hash 不匹配；
- quote/offset 不匹配、跨经历和 stale revision；
- 无效 requirement 引用；
- 重叠范围重复消费和 release/replace；
- 数字越界检查。

### 集成测试

- mock API 完整 snapshot；
- 读取期间 revision 变化时失败并要求重试；
- 相同输入重复构建 fingerprint 一致；
- 真实测试账号只读 smoke test；
- `npm run check` 通过；本阶段未修改后端，因此不要求运行后端测试套件。

## 5. 完成定义

- App 能通过现有普通业务 API 读取 profile、JD 和经历 current revision 正文；
- 没有任何调用后端 LangGraph；
- snapshot 对用户、JD、revision 和模板都有稳定版本标识；
- 所有跨用户、跨经历、跨 revision 和 stale 数据均失败关闭；
- evidence ledger 能确定性阻止无来源、错来源、错误 offset 和重复原文范围引用；
- snapshot 与 ledger 只保存在当前任务内存；
- 测试账号只用于最后的只读 smoke test，凭据未持久化；
- App 全量测试和真实后端只读 smoke test 通过；
- 阶段结果写回本目录 README 后，才进入 G3。

## 6. 明确不做

- 不生成或修改任何简历内容；
- 不实现页面预算或调用 Chromium 编译器；
- 不创建 Resume/ResumeVariant；
- 不实现保存审批；
- 不修改 App Canvas；
- 不把后端 Fact Bank、事实排序或简历生成算法复制进 App；
- 不增加 facts API，也不使用云端 Agent 填充缺失来源。

## 7. 建议执行顺序

```text
1. 契约与现有 API 审计
2. App profile/JD reader
3. ResumeSourceSnapshotBuilder
4. 原文片段 EvidenceLedger 与真实性门禁
5. Agent 只读工具投影
6. 单元/契约/集成测试
7. 测试账号只读 smoke test
8. 阶段结果回写
```

## 8. 实施结果

G1 已按 v1.1 完成。实现文件包括：

- `src/api/normalizers.ts`、`src/api/coolto-api-client.ts`；
- `src/resume/source-types.ts`、`source-snapshot.ts`、`source-projection.ts`；
- `src/resume/evidence-ledger.ts`；
- profile/JD/source snapshot Agent 只读工具；
- `scripts/run-resume-source-smoke.ts`；
- `test/resume-source-snapshot.test.ts` 及 API/工具/Prompt 回归。

最终验证：49 项测试、TypeScript build、Vue typecheck 和 Electron production build 全部通过；
真实账号成功构建包含 21 条 JD requirements 和 7 条 current revision 的 snapshot。没有新增
后端 facts API，也没有持久化账号凭据或业务数据。

G1 的 quote/offset evidence ledger 只存在于本地候选 Workspace，不改变共享数据库契约。
G5 保存阶段必须继续写入后端现有 `Resume` / `ResumeVariant.structured` 结构，并在实施保存前
明确原文证据如何映射到现有字段或由服务端验证；未经该兼容性设计，不新增或擅自改写共享
存储字段。
