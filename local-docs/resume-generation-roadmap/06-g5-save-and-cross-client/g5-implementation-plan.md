# G5 保存审批与跨端互通实施计划

> 状态：已完成并通过三端及真实账号验收  
> 日期：2026-07-24  
> 前置门禁：G4 工程、Chromium/PDF 和真实 DeepSeek 三样本评测通过

> 后续产品语义：本计划中的 `ResumeVariant`、“新版本”和 active variant 是 G5 发布内核的
> 技术术语，不是用户可见云端版本功能。后续产品只展示每份 Resume 的当前 active 内容；
> 历史与回退只属于本地 `ResumeDraftStore` 检查点，不提供 diff。

## 1. 阶段目标

把 G4 内存中的 `ready_for_approval` 候选安全发布为共享数据库中的现有
`Resume` / `ResumeVariant`，并满足：

```text
ready_for_approval
→ prepare_resume_save（只创建不可变本地审批）
→ 用户接受
→ 创建 staged ResumeVariant
→ 服务端重放来源证据
→ 服务端验证 App Chromium 原始布局观察
→ gate_status=passed
→ accept 原子切换 active variant
→ Web/App 读取同一个 structured
```

G5 不调用后端 LangGraph，不让模型直接写数据库，不实现 G7 Canvas，也不改变 Web/App
共享数据库的 `ResumeVariant.structured` 主格式。

## 2. 当前契约和风险

- 后端已有 `Resume`、`ResumeVariant`、`publication_status`、`gate_status`、active variant、
  staged AI edit 和浏览器布局观察基础；
- Web 已按 `ResumeVariant.structured` 渲染，并优先读取 active、published、passed variant；
- App 已有通用 Action Approval，但目前只注册经历导入执行器；
- App G4 Workspace 具备完整 `structured`、EvidenceLedger bindings、source snapshot 和真实
  Chromium compile result；
- 后端现有通用 resume route 已超过 600 行，repository/service 也较大，G5 不继续把发布逻辑
  堆入这些文件；
- 后端和 Web 当前存在用户未提交改动，实施时必须保留，禁止格式化或重写相关大文件。

## 3. 冻结决策

### 3.1 审批边界

- `prepare_resume_save` 只能读取 `ready_for_approval` Workspace；
- 工具只创建本地不可变 Approval payload，用户接受前不得创建 Resume 或 staged variant；
- reject/custom 不产生云端写入；custom 作为自然语言回到同一个 Agent；
- 接受后由宿主 `ResumeSaveExecutor` 调用普通产品 API，DeepSeek 不参与写入步骤；
- Approval payload 使用现有 SHA-256 hash，并作为后端幂等输入的一部分。

### 3.2 保存模式

支持两种明确模式：

1. `new_resume`：创建新 Resume 和首个 staged variant；
2. `new_variant`：在指定 Resume 当前 active variant 上创建 staged 子版本。

第二种模式必须携带 `resumeId` 和 `expectedBaseVariantId`。active variant 在审批期间变化时，
服务端返回 stale conflict，不允许覆盖别的客户端的新版本。

### 3.3 共享 structured 和证据

- 页面内容继续保存为现有 snake_case `ResumeVariant.structured`；
- `content` 必须由后端从 `structured` 确定性派生，客户端不能提交另一份 Markdown 真相；
- 每个 bullet 保留既有 `id`、`matched_jd_requirement_ids` 和 `source_experience_id`；
- G1 quote/offset 证据以可选 snake_case `source_evidence` 扩展附着到对应 bullet；
- `source_evidence` 包含 experience、revision、revision content hash、UTF-16 start/end 和原文
  quote，不伪造不存在的 `source_fact_ids`；
- Web 当前 renderer 忽略不认识的附加字段，但 JSON round-trip 必须保留它；跨端测试证明这一点；
- 后端保存前逐条验证 current revision、hash、offset、quote、bullet 所属 experience 和 JD
  requirement ID。任一来源漂移整体拒绝，不创建可发布版本。

### 3.4 普通产品 API

新增独立 publication router，不继续扩张现有 `resume.py`：

```http
POST /v1/product/resumes/staged
POST /v1/product/resumes/{resume_id}/variants
POST /v1/product/resumes/{resume_id}/variants/{variant_id}/verify-layout
POST /v1/product/resumes/{resume_id}/variants/{variant_id}/accept
POST /v1/product/resumes/{resume_id}/variants/{variant_id}/reject
```

- 两个 stage API 强制写入 `publication_status=staged`、`gate_status=unverified`；
- `new_resume` 的 Resume + variant 创建必须在一个数据库事务内完成；
- stage 使用用户、Approval/Proposal ID 和 payload hash 形成幂等键；同键不同 payload 必须冲突；
- verify 使用服务端已知模板/profile，重新计算比例和 pass/fail；最低占比固定 85%，不能沿用
  AI edit 的 80% 兼容 floor；
- verify 要求一页、无溢出、字体 ready/family 正确、bullet ID 完整、每条尾行至少 66.71%；
- accept 只接受 staged、`gate_status=passed` 且 gate version 为 G5 当前版本的 variant；
- reject 只丢弃非 active staged variant；staged-only 新 Resume 不出现在普通列表或详情；
- accept 原子发布 variant 并切换 `active_variant_id`。

## 4. 模块拆分与上帝类禁令

### 4.1 后端

```text
app/domain/resume/publication/
├── models.py                 # stage/evidence/result 领域模型
├── evidence_validator.py     # current revision + quote/offset/JD 重放
├── repository.py             # publication 专用 Protocol
└── service.py                # stage/verify/accept/reject 编排

app/infra/db/repositories/
└── resume_publication_repo.py # 原子 stage 与幂等持久化

app/api/routes/product/
├── resume_publication_schemas.py
└── resume_publication.py     # 只做 HTTP 映射
```

### 4.2 App

```text
src/resume/save/
├── types.ts                  # Proposal/API payload/result
├── persisted-structure.ts    # bindings → source_evidence
├── layout-observation.ts     # compile result → raw browser observation
├── approval-draft.ts         # 用户确认卡
├── proposal-builder.ts       # ready Workspace → 不可变 payload
└── save-executor.ts          # stage → verify → accept/reject

src/api/
└── resume-publication-api.ts # 资源级 API adapter

src/tools/resume-candidate/
└── prepare-save.ts           # 只创建 Approval
```

硬性规模约束：

- 新增 TypeScript/Python 业务文件目标不超过 220 行，硬上限 250 行；
- route、service、executor、evidence validator 必须分离；
- 不把 API 序列化、来源验证、审批预览、网络补偿写进同一个类；
- 现有大文件只允许最小接线，不做顺手重构或全文件格式化；
- 发现单文件接近上限时先拆模块再继续，不以“阶段快完成”为理由形成上帝类。

## 5. 分步实施

### G5-A：契约和后端发布内核

1. 增加 publication 领域模型、source evidence validator 和专用 repository；
2. 实现新 Resume 原子 stage、已有 Resume stale-safe stage 和幂等冲突；
3. 增加通用 verify/accept/reject，复用 observability 的确定性计算而不复制规则；
4. 新增独立 FastAPI router、依赖注入和 main router 接线；
5. 后端单元/API 测试覆盖所有权、来源漂移、quote/offset、JD ID、幂等、stale、隐藏、
   verify 失败、未通过禁止 accept 和原子 active 切换。

### G5-B：App 保存审批

1. 扩展共享 ResumeBullet 类型以承载 `source_evidence`；
2. 从 Workspace 生成冻结 payload，重新检查 status/revision/quality/compile；
3. 把 compile result 转为后端 BrowserLayoutObservation，不让模型编写像素；
4. 实现审批预览和 `prepare_resume_save`，未达标候选 fail closed；
5. 注册 `ResumeSaveExecutor`，用户接受后执行 stage → verify → accept；
6. verify 失败时 best-effort reject staged variant，并返回精确错误；网络重试依赖幂等 stage；
7. 成功结果返回 resume ID、variant ID、版本和 active 状态，不声称不存在的保存。

### G5-C：跨端与真实集成

1. App API adapter 与后端响应 contract 测试；
2. App 保存的 structured 通过 Web 现有 renderer/type contract，无转换层；
3. Web 创建/保存的 published variant 可由 App reader 读取；
4. reject/custom/来源漂移/布局失败/active 竞争均不误发布；
5. 使用测试账号执行一次真实新 Resume 保存和一次新 variant 保存；
6. 真实保存后从 Web 产品 API 读取同一 active variant，并比较 structured/profile/bullet IDs；
7. 测试产生的云端资产使用明确测试标题；若需要删除或污染真实列表，先取得用户确认。

## 6. 测试矩阵

### 确定性测试

- ready 状态才可 prepare save；
- Proposal payload 深拷贝、hash 稳定、替换同 scope 审批；
- 接受前 API write count 为 0，reject/custom write count 为 0；
- executor 严格按 stage → verify → accept 调用；
- 服务端来源重放拒绝 revision/hash/quote/offset/bullet/JD 任一不一致；
- stage 幂等且同键不同 payload 冲突；
- verify 缺字体、少 bullet、低于 85%、尾行低于 66.71%、多页或溢出均失败；
- accept 未通过、已 discarded、stale parent 均失败；
- active 切换与 publication 状态在数据库事务内一致。

### 跨端测试

- App payload → 后端 JSONB → Web 读取不丢字段；
- Web published variant → App normalizer → 同一 `ResumeStructure`；
- Web/App 模板 ID、profile version/hash 完全一致；
- content 与后端从 structured 派生的 Markdown 一致；
- staged/discarded variant 不进入普通 Web/App 简历仓库视图。

### 命令门禁

- App：`npm run check`、G4 renderer QA、G5 focused tests、`git diff --check`；
- 后端：G5 focused pytest、API contract tests、ruff、mypy（若仓库当前基线允许）、完整 pytest；
- Web：现有 resume template/canvas/AI edit contract 测试和 build；
- 新增文件逐个检查行数，任何业务文件超过 250 行即视为未完成。

## 7. 失败与恢复

- stage 失败：无 active 变化，用户可重新发起审批；
- stage 成功但 verify 失败：variant 标为失败/丢弃，不发布；
- verify 成功但 accept 网络中断：重新发起相同 Proposal 时通过幂等 stage 找回 variant，再查询
  状态并继续，不能创建重复版本；
- active 在审批期间变化：返回 stale conflict，本地重新读取后由用户决定，不自动 rebase；
- 来源 revision 变化：回到 G1 重新 snapshot/G3-G4，不允许忽略；
- 后端未知异常：不吞错、不把 staged 当作 saved、不改变本地 best snapshot。

## 8. 完成定义

只有同时满足以下条件才把 G5 标记为完成：

- 用户接受前没有云端写入；
- 服务端来源和布局复验均通过后才能 active；
- 新 Resume 和已有 Resume 新版本两条路径都通过；
- App 保存后 Web 读取和渲染同一 active structured；
- Web published variant 可由 App 读取；
- 失败路径没有误发布和不可见孤儿资产；
- App、后端、Web 三端相关全量检查通过；
- 代码模块符合 220 行目标/250 行硬上限，没有新增上帝类；
- G5 README、总路线和总实施计划记录真实测试结果与剩余边界。
