# P0-A：云端单文档简历破坏性重构

> 状态：已完成；代码、自动化回归、空库重建、数据重导与双向实测均通过  
> 决策日期：2026-07-24  
> 前置：P0 契约现状核对、G1–G7 已有生成能力  
> 实施性质：开发期破坏性重构；不迁移旧简历数据、不保留旧 API 或双读双写

## 1. 决策与目标

云端每个 Resume 只有一份当前完整文档。App、Web 与后端共享同一个 `CloudResume`
contract，不存在 variant、active variant、云端版本历史、云端回退或版本 diff。

App 的本地不可变 checkpoint 继续用于本地回退，但 checkpoint 不上传云端、不进入共享
contract，恢复 checkpoint 也不会自动写云端。

本阶段必须同时完成：

1. 后端领域模型、数据库、API、生成/编辑/发布和观测链路的单文档化；
2. Web 端 Resume API、Canvas、手工编辑和 Web Agent 编辑链路的单文档化；
3. App 端云端读取、保存审批、Agent tools、导出和本地草稿关联的单文档化；
4. 在代码通过后清空开发数据库并重新建库，由用户重新导入业务数据；
5. 证明 Web Agent 与 App Agent 的原有功能全部可用且未被破坏。

## 2. 唯一共享契约

```ts
interface CloudResume {
  id: string
  title: string
  targetRole?: string
  jdId?: string
  structured: ResumeStructure
  contentHash: string
  schemaVersion: string
  qualityStatus?: string
  qualityIssues?: QualityIssue[]
  status: 'draft' | 'active' | 'published' | 'archived'
  createdAt: string
  updatedAt: string
}
```

- `structured` 是唯一持久化内容源；文本、搜索投影和 PDF 输入均从它确定性派生。
- `contentHash` 只是当前内容指纹，用于幂等和并发覆盖保护；它不保存历史，也不是版本号。
- HTTP 使用 `ETag / If-Match` 或等价的 `expectedContentHash` 检测 App 与 Web 的并发
  覆盖。冲突返回 `409`，不创建隐藏版本。
- `POST` 与 `PUT` 必须提交完整 `structured`，禁止创建只有元数据的空 Resume。
- 运行时代码和产品 contract 删除 `ResumeVariant`、`variants[]`、`activeVariantId`、
  `variantId`、父版本、版本号、版本 diff 与 `new_variant` 保存模式。

## 3. 后端实施范围

### 3.1 领域与存储

- `Resume` 直接持有当前 `structured`、`content_hash`、schema 和当前质量结果；
- Repository 只对一个 Resume 当前文档执行创建、读取和原子替换；
- 删除 variant CRUD、激活、接受、拒绝、父链和版本排序；
- 最终 schema 删除 `resume_variants`、`resume_items`、`resumes.active_variant_id`，以及所有
  variant 外键和索引；
- `resumes` 增加 `structured JSONB NOT NULL`、`content_hash TEXT NOT NULL`、
  `schema_version TEXT NOT NULL`、当前质量字段；
- 新增破坏性 schema migration，直接删除/重建简历相关结构，不做 backfill。

### 3.2 写入与质量门

- 用户确认前，AI 候选只存在于本次 graph/thread 临时状态，不创建空 Resume；
- 创建或覆盖请求一次提交完整结构、证据绑定、布局 observation、幂等键和可选 `If-Match`；
- 后端按顺序完成 schema、来源证据、确定性内容、布局和质量门验证；
- 全部通过后才在同一事务内创建或替换当前 Resume；任一步失败均不得改变云端当前内容；
- staged/verify/accept/reject variant API 被一个原子 create/replace service 取代；
- generation/layout observability 使用 `resume_id`、`content_hash` 或临时 `run_id`，不使用
  variant ID。

### 3.3 API

```text
GET    /v1/product/resumes
POST   /v1/product/resumes
GET    /v1/product/resumes/{resumeId}
PUT    /v1/product/resumes/{resumeId}
PATCH  /v1/product/resumes/{resumeId}
POST   /v1/product/resumes/publish
PUT    /v1/product/resumes/{resumeId}/publish
```

删除 `/variants/*` 和 `/publication/{stage,verify,accept,reject}`。归档继续通过 metadata PATCH；
P0 暂不新增物理删除 API。

## 4. Web 实施范围

- API 和 store 只维护一个 `CloudResume.structured`；
- 删除 active/published/first variant fallback 和所有 variant 选择/创建状态；
- 创建、手工编辑、Canvas 保存都发送完整结构；
- Web Agent 的生成、局部编辑、确认、取消和继续对话流程保持原有行为，候选只在 thread/页面
  临时状态中，确认后覆盖当前 Resume；
- thread canvas 只保存一个 `structuredSnapshot`，不保存 variants 或 selected variant；
- 保存携带 `If-Match`，冲突时刷新或由用户明确覆盖；
- Resume renderer、A4 布局、打印和 Canvas 恢复契约不得回归。

## 5. App 实施范围

- 删除云端 Resume variant 类型、normalizer、API 和 Agent tool 参数；
- Agent 只读取/操作一个 `CloudResume`；
- 保存只分为“创建云端 Resume”和“覆盖已有 Resume”，继续经过不可变 Proposal 与宿主审批；
- 原有来源证据、质量门和 Chromium 布局 observation 继续传给后端原子写入服务；
- `ResumeDraftCloudLink` 删除 `variantId`，保留 `resumeId`、云端当前 `contentHash`、
  `syncedAt` 和对应的本地 `syncedRevision`；本地修订只用于判断未同步修改，不进入云端；
- 云端下载直接建立本地草稿，上传提交当前完整结构；
- 本地 checkpoint、恢复为新工作头、局部编辑、PDF 导出和保存位置选择保持原有行为；
- App Agent 的生成、自检、修复、审批、保存、继续编辑和导出流程不得回归。

## 6. 数据库清空与发布顺序

1. 后端、Web、App 全部完成并通过各自静态检查和单元测试；
2. 使用隔离的空数据库执行 migration 与三端集成测试；
3. 停止开发服务并再次确认目标为可丢弃的开发数据库；
4. 执行 `docker compose down -v`、重新启动 Postgres、`alembic upgrade head`；
5. 用户重新导入业务数据；
6. 对新数据执行 App → Web 和 Web → App 双向验收。

清库会同时删除用户、JD、经历、简历、thread/checkpoint 等数据库数据，因此只能在代码门禁通过
后执行。不得尝试保留、转换或兼容旧 Resume 数据。

## 7. 硬性验收标准

### 7.1 单文档与跨端一致性

- App 上传后，Web 读取到完全一致的 `structured` 与 `contentHash`；
- Web 保存后，App 读取到完全一致的当前文档；
- 校验失败不改变当前 Resume，重复请求不创建第二份内容；
- 并发覆盖返回明确冲突，不生成云端版本、variant 或 diff；
- App 本地 checkpoint 恢复不触发云端写入。

### 7.2 Web Agent 不回归

- 新对话生成简历、已有简历 AI 局部编辑、预览、手工编辑、确认/取消、Canvas 恢复均可用；
- Web Agent 编辑后的结构可保存并被 App 读取；
- Resume renderer、浏览器布局 QA、A4 打印和已有 contract tests 全部通过；
- SSE、thread metadata 和工具调用中不存在 variant 依赖。

### 7.3 App Agent 不回归

- G1–G4 生成、自检与修复能力保持通过；
- Action Approval 在用户接受前零云端 Resume 写入，拒绝/取消不污染云端；
- 新建保存、覆盖保存、冲突处理、云端重新读取全部可用；
- 本地 checkpoint、局部编辑、预览和 G6 PDF 导出全部通过；
- Agent tools、prompt 和事件中不存在 `activeVariantId` 或 `variants[]`。

### 7.4 代码与数据库门禁

- 后端 runtime、Web src、App src 中不存在 `ResumeVariant`、`activeVariantId`、variant endpoint；
- 最终数据库不存在 `resume_variants`、`resume_items` 和 variant 外键；
- 后端 `ruff`、`mypy`、focused/full pytest 通过；
- Web typecheck、build、resume layout/Canvas/AI edit/browser QA 通过；
- App `npm run check`、Chromium/PDF QA 和 Electron 端到端验收通过；
- 三仓库 `git diff --check` 通过，所有失败必须区分既有失败与本次回归并记录证据。

## 8. 文档取代关系

- 本 section 取代 G5 中“云端 variant 作为发布内核”的当前设计；
- G5 README、实施计划与结果仅保留为历史记录，不再定义现行 contract；
- P0-01 中“后端 variant 是内部实现”“P0 后端无缺口”“兼容读取旧数据”等结论全部失效；
- P4 只管理云端当前内容、本地草稿关联、同步状态和本地 checkpoint，不实现云端版本 diff。

## 9. 实施结果与验收记录

> 执行日期：2026-07-24

### 9.1 已完成改动

- [x] 后端 `Resume`、Repository、Service 与 PostgreSQL schema 改为直接持有唯一
  `structured/content/content_hash`；
- [x] 删除云端 variant/item/publication-history Repository 与全部 `/variants`、
  `/resume-items` endpoint；
- [x] 新增原子 `POST /resumes/publish` 与 `PUT /resumes/{id}/publish`，接受前不写
  Resume，接受后只创建或覆盖一行；
- [x] AI 编辑使用有过期时间的临时 proposal；proposal 不属于 Resume 历史，接受后覆盖当前
  Resume，拒绝后删除；
- [x] generation、layout observation、SSE、thread canvas、Copilot action 对外 contract
  改用 `resumeId/contentHash/proposalId/resume`；
- [x] Web Resume API、Canvas、仓库手工编辑、Web Agent AI 编辑与审阅改为单文档；
- [x] App 云端 normalizer、Agent tools、保存审批、PDF 来源解析和本地 cloud link 改为
  单文档；本地 checkpoint 与回退保持不变；
- [x] 三端源码与测试中删除 `ResumeVariant`、`activeVariantId`、variant endpoint
  依赖；
- [x] 开发 PostgreSQL `pgdata` 已删除并从空库迁移到 Alembic `0024`。

### 9.2 自动化验收证据

| 范围 | 结果 |
| --- | --- |
| 后端全量 pytest | `568 passed, 3 skipped`；API 安全矩阵 `121 passed`；测试时显式关闭开发免登录 |
| 后端聚焦 Ruff | 本次全部 Python 改动与新增 migration/test 均通过 |
| 后端编译 | `compileall` 通过；应用与 OpenAPI 可加载 |
| Web FE-1 | manifest、typecheck、41 条 Resume/Agent contract tests、H5 build、真实浏览器 layout/print QA 全部通过 |
| App 全量 check | 模板同步、CLI/Desktop typecheck、`96 passed`、TS build、Electron build 全部通过 |
| App Electron/PDF QA | 通过；usage ratio `0.8729`、最小 bullet tail ratio `0.6765`，生成 qualified PDF 与 G6 PDF |
| 数据库 | Alembic `0024`；`resume_variants`/`resume_items` 不存在；users/resumes/experiences/JD/threads/artifacts 均为 0 |
| 变更格式 | 后端、Web、App 三仓库 `git diff --check` 全部通过 |

全仓历史门禁的非本次问题：

- 后端全仓 Ruff 仍有 3 条位于未改动的 auth/artifact 文件中的既有告警；本次变更文件为
  0 条；
- 后端全仓 mypy 使用原缓存时触发 mypy 2.2.0 internal error；禁用增量缓存后可运行，
  报告 23 条、仅分布在 5 个未改动的 artifact/provider/user 文件中，本次简历改单无
  mypy 报错。

### 9.3 清库核验

执行顺序：

1. 三端自动化门禁通过；
2. `docker compose down -v --remove-orphans`，仅删除 `cv-agent_pgdata`；
3. `docker compose up -d postgres`，容器健康；
4. `.venv/bin/alembic upgrade head` 从 `0001` 完整迁移到 `0024`；
5. 只读查询确认旧表不存在、新 `resumes` 有 19 个直接文档字段、业务表均为空。

未删除 App 本地 `ResumeDraftStore`、本地 checkpoint 或工作区文件。

### 9.4 数据重导与真实服务双向验收

本机 App 用户目录只保留一份加密登录会话和一条空对话，没有本地
`*.coolto-resume` 草稿或其他可恢复的旧业务导出。系统安全策略禁止从本机安全存储提取登录
凭据，因此未绕过安全存储，也未把仓库 fixture 冒充用户旧数据。

在用户授权由 Codex 完成重导与实测后，通过正常注册和公开产品 API 建立一套明确标记、无真实
个人信息的 P0 验收数据；数据保留在重建后的开发库中：

- [x] 注册 1 个验收账号，导入 1 个 JD、6 条经历；
- [x] App 使用真实 `CooltoApiClient`、Action Approval、来源证据和 Chromium 布局观测，
  创建 1 份云端 Resume；
- [x] Web HTTP contract 读取后与 App 的 `structured/contentHash` 完全一致；
- [x] Web 使用 `If-Match + expectedContentHash` 覆盖同一 Resume，App 重新读取后
  `structured/contentHash` 完全一致；
- [x] 使用第一次读取的过期 `contentHash` 再次覆盖，后端返回 `409`，当前内容与哈希不变；
- [x] App 列表仍只有 1 份 Resume，响应不包含 `variants` 或 `activeVariantId`；
- [x] 数据库确认 `users=1`、`jd_records=1`、`experiences=6`、`resumes=1`、
  `resume_edit_proposals=0`，且 `resume_variants`、`resume_items` 均不存在。

实测 Resume：

- `resume-42601ce6-159c-53d0-8d2e-edefe6aa6622`
- App 创建哈希：`87b5c06a45be37559ad259e8c9a82862b678c92ee49b6d62a3d423f181bd7b51`
- Web 覆盖后当前哈希：`fd86051267a421b89090bb5bbb5933ea1a9bfd07f0d2adab28c91206fb4a794b`

可重复验收入口为 `npm run qa:p0-single-resume-live`；它只使用公开 API，不直接写数据库，也不
输出账号密码或访问令牌。App/Web Agent 原有功能的全量自动化回归证据见 9.2，本次实测补齐
9.3 清库后唯一剩余的跨端数据一致性与并发冲突门禁。
