# G5 实施与验收记录

> 结论：通过  
> 日期：2026-07-24  
> 范围：App 本地审批与执行、后端发布内核、Web/App 共享 structured

> 后续产品决策：本文的 variant/版本描述只保留为 G5 历史实施记录。现行设计由
> [P0-A 单文档重构](../../p0-product-completion-roadmap/01a-p0-single-cloud-resume-rebuild/README.md)
> 定义；内部 Resume variant、staged/verify/accept 也将删除，质量门改为写入前验证后原子覆盖
> 唯一当前文档。

## 1. 最终链路

```text
ready_for_approval
→ prepare_resume_save（本地不可变审批，零云端写入）
→ 用户接受
→ stage new Resume / new variant
→ 服务端按 current revision 重放 quote、UTF-16 offset 和 hash
→ 服务端复验 App Chromium 原始 observation
→ gate_status=passed
→ accept 原子切换 active_variant_id
→ Web/App 读取同一个 published structured
```

保存过程不调用后端 LangGraph，也不让 DeepSeek 直接写数据库。`content` 由后端从
`structured` 确定性派生；来源证据由后端验证后以 `source_evidence` 注入 bullet，因此没有
增加计划草案中的 App 侧 `persisted-structure.ts`，也没有复制一套证据注入逻辑。

## 2. 实现结果

### 后端

- 独立 `publication` 领域目录拆分模型、证据验证、repository protocol 和编排 service；
- 独立 publication router 提供 stage、verify、accept、reject；
- 新 Resume + 首个 staged variant 在同一事务创建；
- 已有 Resume 使用 `expectedBaseVariantId` 防止 active 竞争覆盖；
- Proposal 与 payload hash 形成确定性 ID，同键不同 payload 冲突；
- accept 只允许当前 G5 gate version 下 passed 的 staged variant；
- staged/discarded 不进入普通 Resume 列表和详情。

### App

- `prepare_resume_save` 只创建 Action Approval；reject/custom 不写云端；
- `ResumeSaveExecutor` 严格执行 stage → verify → accept；失败只清理一次 staged variant；
- `list_resumes`、`get_resume` 在保存新版本前锁定 Resume 和 active variant；
- App API adapter 使用现有 snake_case structured，没有 App 私有存储格式；
- 修正经历创建响应契约：POST 返回 summary 后再读取详情，避免错误要求 POST 自带
  `revisions[]`。

### Web

- G5 没有修改 Web 业务代码；
- 现有 Resume renderer、Canvas persistence、AI edit、manifest 与浏览器打印契约全部通过；
- 后端注入的 `source_evidence` 作为附加 JSON 字段被保留，不影响现有 renderer。

## 3. 自动化验收

| 范围 | 结果 |
| --- | --- |
| App `npm run check` | 80 tests passed，类型检查、Node build、Electron build 通过 |
| App Chromium/PDF QA | 通过；一页 A4，页面占比 87.29%，最短尾行 67.65% |
| PDF postflight | SimSun、Times New Roman、文本层、A4 纵向、单页全部通过 |
| 后端 G5 focused | 28 passed；ruff、mypy 通过 |
| 后端全量 | `DEV_AUTO_AUTH=false` 下 603 passed、3 skipped |
| Web `check:resume-layout` | 41 tests passed，typecheck、H5 build、浏览器 QA 通过 |
| whitespace | App 与后端 `git diff --check` 通过 |

后端第一次全量测试的 52 个失败来自本地 `.env` 的 `DEV_AUTO_AUTH=true`，全部是
“未登录应返回 401”的安全矩阵；关闭开发免登录开关后同一代码 603 项全部通过。

## 4. 真实账号验收

真实测试执行了两条正式发布路径：

1. 创建新 Resume 和首个 staged variant，来源与布局复验通过后发布；
2. 以首个 active variant 为 expected base 创建第二版本，复验通过后原子切换 active；
3. App reader 与模拟 Web 产品 API 分别读取 Resume，active variant 与完整 structured 相同；
4. persisted bullets 均包含服务端验证后写入的 `source_evidence`。

验收数据：18 条 bullet evidence、页面占比 87.29%、最低尾行 67.65%、6 条正式测试来源。
测试标题和来源均带 `G5 LIVE QA` 前缀。第一次发现创建响应契约问题前还创建了 1 条同前缀
来源，因此账号中共保留 7 条 G5 测试经历；未自动归档或删除，以免执行未授权的破坏性操作。

## 5. 非上帝类检查

- G5 新增 App 业务文件最大 131 行；
- G5 新增后端业务文件最大 200 行；
- 全部低于 220 行目标和 250 行硬上限；
- HTTP、API 序列化、审批、保存补偿、证据验证、数据库事务和实时测试 fixture 均分文件；
- 现有后端大 route/service 只做最小接线，没有继续堆积发布逻辑。

## 6. 后续边界

- G6 继续收口系统保存位置选择和用户可见 PDF 导出流程；
- G7 再实现 Canvas、进度、本地检查点回退、局部编辑和导出入口；
- 8000 端口原有后端进程未停止，G5 验收使用隔离的 8001 进程并已关闭；
- 测试资产如需清理，应由用户明确要求后再按精确 ID 归档，不能批量猜测删除。
