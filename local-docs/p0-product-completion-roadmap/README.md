# Coolto P0 产品能力补齐路线

> 状态：既有产品路线与完成记录保留为历史基线；后续开发已统一为一条正式执行链
> 当前阶段：S4 Tracker 业务闭环已完成；下一阶段为 S4.5 简历生成与交付修复，之后按 S5 → R1 推进
> 建立日期：2026-07-24
> 上游依赖：[简历生成交付路线](../resume-generation-roadmap/README.md) G1–G7 已完成

本路线补齐完整 PRD 中仍缺失、且不依赖内置浏览器或邮箱的四条 P0 用户链路：

1. 把已有简历附件解析与经历导入能力接入 Electron 桌面界面；
2. 在 App 对话中粘贴 JD 并确认入库；
3. 基于 JD 与完整经历库生成可解释、可追溯的结构化匹配分析；
4. 集中管理云端简历当前内容和本地草稿，并支持本地检查点回退。

本路线不实现通用材料库、图片 OCR、内置浏览器、招聘网站自动填表、邮件投递、投递追踪看板
或面试提醒。JD URL 抓取属于浏览器路线；“简历是否已投递”必须由未来的投递记录派生，本路线
不在简历上创建第二套临时投递状态。

## 文件树

```text
p0-product-completion-roadmap/
├── README.md
├── 00-foundation/
│   ├── README.md
│   ├── product-scope-and-architecture.md
│   ├── ui-design-standards.md
│   └── implementation-plan.md
├── 01-p0-contracts-and-regression/
│   └── README.md
├── 01a-p0-single-cloud-resume-rebuild/
│   └── README.md
├── 02-p1-attachment-intake/
│   └── README.md
├── 03-p2-jd-ingestion/
│   └── README.md
├── 04-p3-structured-match-analysis/
│   └── README.md
├── 05-p4-resume-library/
│   └── README.md
└── 06-p5-integrated-delivery/
    └── README.md
```

## 阶段索引

| 顺序 | 阶段 | 状态 | 核心产物 |
| --- | --- | --- | --- |
| 00 | [基础与总设计](./00-foundation/README.md) | 已建立 | 范围、架构边界、UI 规范、总计划 |
| 01 | [P0：契约和回归基线](./01-p0-contracts-and-regression/README.md) | 已完成 | 能力矩阵、共享契约、fixtures、门禁 |
| 01A | [P0-A：云端单文档简历破坏性重构](./01a-p0-single-cloud-resume-rebuild/README.md) | 已完成 | 单文档 contract、三端重构、清库、数据重导与 Agent/跨端回归 |
| 02 | [P1：桌面简历附件接入](./02-p1-attachment-intake/README.md) | 已完成 | 系统选择器、受控注册、本地解析、经历导入 |
| 03 | [P2：JD 粘贴入库](./03-p2-jd-ingestion/README.md) | 核心实现与 Browser Demo 已完成；真实验收并入统一 S5 | JD 提取预览、审批与云端写入 |
| 04 | [P3：结构化匹配分析](./04-p3-structured-match-analysis/README.md) | 核心实现已完成；完整真实模型验收并入统一 S5 | 固定评分、亮点、缺口、建议、证据链 |
| 05 | [P4：简历仓库](./05-p4-resume-library/README.md) | 已完成；后续由 J0–J3 扩展为求职仓库 | 云端当前内容、本地草稿、同步状态与本地回退 |
| 06 | [P5：集成交付](./06-p5-integrated-delivery/README.md) | Browser Demo 已完成；真实 Electron 最终验收由统一 S5 替代 | App 端到端、跨端一致性、真实账号验收 |

## 执行原则

- 每个阶段必须先完成实施计划和现状复核，再修改代码；
- 每个阶段完成后单独质检，通过后才能进入下一阶段；
- App Agent 与后端 LangGraph 完全独立；App 只调用后端固定资产业务 API；
- 云端数据库是经历、材料、JD 和简历当前内容的唯一权威来源；历史检查点只保存在本地；
- 云端 Resume 使用 P0-A 单文档 contract，不存在 variant、云端版本历史或版本 diff；
- 用户选择的本地文件、聊天、临时分析和未确认提案只保存在本地；
- 写云端、覆盖、归档和删除操作必须使用不可变 Proposal 与宿主审批；
- 不复制 Web/后端已有固定资产结构，不建立 App 私有 JD、材料或云端简历格式；
- 页面和组件遵守本路线的 [UI 设计规范](./00-foundation/ui-design-standards.md)；
- 新业务文件以 220 行以内为目标，250 行为硬上限；超出前必须按职责拆分，禁止上帝类。

## 新后端业务同步接入路线（2026-07-27）

> 状态：Resume、Experience/JD 当前调用面与 S3 Application 已完成同步接入；本节保留
> S1–S3 的历史能力基线，未来工作统一按后文正式执行链推进。

### 已有基线

- 新后端已经实现 Experience、JD、Resume 和 Application Tracker 的数据库结构、CRUD、
  乐观锁、墓碑、Push/Pull/Bootstrap、Projector 与同步 CommandHandler；
- App 已建立按账号隔离的加密 `LocalSyncStore`、Outbox、Bootstrap/Pull、单实例 Worker、
  失败重试和冲突留痕；
- Resume Library 已统一从本地 projection 读取，写操作先进入 Outbox，再由 Worker 推送；
- `ResumeDraft`、checkpoint、原始附件、聊天和 LLM 调用继续只在 App 本地，不增加云端实体；
- Experience/JD 当前已有 Direct API Adapter，可在迁移期间作为兼容参考，但不得继续作为
  完成迁移后的业务事实来源；Tracker 后端已实现，App 端完整 Store/Adapter/UI 尚未建立。

### 接入顺序

| 顺序 | 阶段 | App 端主要工作 | 完成门槛 |
| --- | --- | --- | --- |
| S1 | Experience 同步接入 | 建立职责单一的 `ExperienceSyncStore`；让经历导入、查询、编辑和删除统一读写本地 projection 与 Outbox；保留 revision 的服务端事实语义 | 离线增改删可立即本地读取；恢复网络后只应用一次；Bootstrap/Pull、墓碑、陈旧版本冲突和跨账号隔离通过 |
| S2 | JD 同步接入 | 建立 `JdSyncStore`；让 JD 审批入库、查询、聚合更新和删除统一经过本地 projection 与 Outbox；保持 requirement ID 稳定 | 离线写入和重放通过；requirements 全量更新不漂移 ID；另一设备修改可 Pull；冲突不静默覆盖；既有匹配与简历生成仍能读取稳定 JD |
| S3 | Tracker 基础接入 | 增加 Application、status event、Interview、Note、Reminder 的 App 类型、Normalizer、Store 和 Adapter；先完成 Application 看板、详情与合法状态迁移 | Application 离线创建/编辑/删除、跨设备同步和墓碑通过；非法状态迁移显示服务端错误；JD/Resume 引用与标题快照正确 |
| S4 | Tracker 业务闭环 | 接入 Interview、Note、Reminder UI 与本地通知调度；补齐同步状态、失败恢复和冲突处理界面 | 状态事件与当前状态一致；终态不可继续迁移；提醒可跨设备同步并由本机执行通知；父 Application 删除能传播子实体墓碑 |
| S4.5 | 简历生成与交付修复 | 补齐个人资料、可扩展经历/技能、教育排版、三分钟生成目标与预览直接导出；保持既有工作/项目渲染和生成界面形态 | 信息有事实来源；门槛不降；每次真实用户命令的完整生成耗时不超过 180 秒；预览按钮直接导出当前合格版本；真实 Electron/PDF 质检通过 |
| S5 | 整体联调与性能验收 | 使用 Docker 后端完成真实 App 主路径、离线恢复、双设备冲突、分页与重启重放；清理迁移后不再使用的 Direct 写路径 | App 全量检查通过；500 条同步分页和 Tracker 看板达到约定指标；无重复创建、静默覆盖、跨账号泄漏或绕过 Outbox 的业务写入 |

### 完成记录

- **S1 Experience 同步接入（现有创建/查询调用面已完成，2026-07-28 质检修复）**
  - 新增 `src/desktop/main/experience-library/experience-sync-store.ts`
    （`ExperienceSyncStore implements ExperienceReader, ExperienceWriter`）与纯映射
    `experience-sync-mapping.ts`（无 electron 依赖，`node --test` 可覆盖）。
  - 读走本地 projection（`listEntities/getEntity`，含 q/category/tags 过滤与
    updated_at DESC 分页），`createExperience` 合成首个 revision 后入 Outbox；
    无幂等键时生成新 UUIDv7；有 `idempotencyKey` 时持久化复用同一 entity/operation ID，
    同键不同请求会在本地拒绝，避免重试生成重复 Experience。
  - 在 `ipc.ts` 构造并注入 `DesktopAgentRuntime`，替换原 `experienceReader/
    experienceWriter` 与 `ResumeSourceSnapshotBuilder.experience` 的直连 apiClient；
    经历导入 executor、search/get 工具、去重与简历生成读取统一走本地 Store。
  - 契约要点：本地 projection 键与后端 `experience/syncadapter.payload` 完全一致
    （revision 用 `revisionNumber`，读回时 `factBankStatus` 恒为 `not_applicable`）；
    push 键与 `createPayload`（`source=manual`、`status=active`）一致。
  - 单测：`test/experience-sync-mapping.test.ts`（写 payload 键、revision 合成、
    墓碑 deletedAt、过滤/分页/游标）。
  - 后端 Experience 日期改为保留 `YYYY-MM`、`YYYY-MM-DD` 和结束日期 `present` 的文本语义，
    App 不再需要把月精度日期伪造为完整日期。
  - 当前 App 尚无 Experience 编辑/删除 executor 或 UI；因此完整 S1 门槛中的离线 update/delete、
    墓碑和对应冲突界面仍待相关产品入口出现后补齐，不再将其表述为已完成。

- **S2 JD 同步接入（现有创建/查询调用面已完成，2026-07-28 质检修复）**
  - 新增 `src/desktop/main/jd-library/jd-sync-store.ts`
    （`JdSyncStore implements JdReader, JdWriter`）与纯映射 `jd-sync-mapping.ts`。
  - 读走本地 projection，`createJd` 在创建时一次性分配稳定 requirement ID 与
    `sortOrder`；legacy importance/category 映射为后端 canonical 值
    （`high→must_have` 等），读回时再映射回 legacy 并补 `v2Importance/v2Category`，
    保证既有匹配分析与简历生成读取不变。
  - 在 `ipc.ts`/`agent-runtime` 替换 `jdReader/jdWriter` 与
    `ResumeSourceSnapshotBuilder.jd` 的直连 apiClient；JD 保存 executor 与
    search/get/match 工具统一走本地 Store。
  - 契约要点：push 键与后端 `jd/syncadapter.writePayload`
    （`sourceKind=pasted`、`requirementsOrigin=app_extracted`、canonical importance）
    一致；本地 projection 键与 `jd/syncadapter.payload` 一致。
  - 单测：`test/jd-sync-mapping.test.ts`（写 payload 键与 canonical 枚举、requirement
    ID 稳定与 sortOrder、canonical↔legacy 往返、墓碑、过滤/分页）。
  - `idempotencyKey` 现在稳定复用 entity/operation ID；requirements 只在首次创建时分配 ID，
    同一业务请求重试不会生成第二份 JD 或漂移 requirement ID。
  - legacy `skill/experience/language` 等 category 在 push 前统一映射为后端 canonical 枚举，
    缺失或未知值安全回落为 `other`，避免后端 `validation_failed`。
  - 当前 App 尚无 JD 编辑/删除 executor 或 UI；聚合 update/delete、墓碑和冲突界面仍是后续工作，
    不计入本次“现有调用面完成”。

- **验证证据（S1+S2）**
  - `npm run check` 全绿：`typecheck`（Node）+ `desktop:typecheck`（vue-tsc）+
    `test`（196 通过）+ `build` + `desktop:build`。
  - 真实 Docker 后端（`cv-agent-app-be`，:8080）联调：email challenge/verify 登录后
    经 `/v1/sync/push` 推送 Experience+JD 的 create（`applied`，version=1，后端
    `DisallowUnknownFields` 接受本 Store 生成的 payload）；`/v1/sync/bootstrap`
    回读的 projection 键与本地映射完全对齐（含 requirement `sortOrder`）；
    重放同 `operationId` → `already_applied`（不重复创建）；陈旧 `expectedVersion`
    update → `conflict/entity_version_conflict`（不静默覆盖）。
  - 2026-07-28 质检 smoke：真实 Docker 后端接收月精度 Experience（`2022-01` 到
    `present`）并原样 Bootstrap；legacy JD `skill` 映射为 `technology`；同 operation ID
    重放均返回 `already_applied`。测试资产随后已软删除。
  - 创建成功提示统一改为“已保存到本地，等待同步”；projection 暴露
    `clean/pending/conflict`，不再把 Outbox 入队误报为云端成功。完整冲突/失败处理 UI 仍归 S5。

### 统一执行 Roadmap（2026-07-28，用户确认）

> 只保留一条未来开发顺序。N0、N1、S3 是已完成的历史前置；后续每阶段先做现状复核，
> 遇到本节列出的产品语义、UI、破坏性操作或基础设施取舍时暂停并向用户确认，确认后才实现。

```text
N0（已完成）→ N1（已完成）→ S3（已完成）
→ A0（已完成）→ J0（已完成）→ J1（已完成）→ J2（已完成）→ J3（已完成）
→ E0（已完成）→ E1（已完成）→ E2（已完成）→ E3（已完成）
→ E4（已完成）→ E5（已完成）→ E6（已完成）→ S4（已完成）
→ S4.5 → S5 → R1
```

| 顺序 | 阶段 | 主要交付 | 当前状态 |
| --- | --- | --- | --- |
| N0 | 冻结联调基线 | App/Backend 兼容 commit、Migration、契约快照 | ✅ 已完成 |
| N1 | 真实 App 验收 | OTP、Resume、Experience、JD、断网恢复与账号隔离 | ✅ 已完成 |
| S3 | Tracker 基础接入 | Application 看板、详情、时间轴、日历、合法迁移与同步验收 | ✅ 已完成 |
| A0 | 架构与工程治理 | 统一状态、冻结实体关系、拆分超长文件、建立 250 行门禁和单一页面导航状态 | ✅ 已完成 |
| J0 | 求职仓库关系模型 | 建立 JD、Resume、Application 的职责单一只读聚合，不新增第二套云端关系 | ✅ 已完成 |
| J1 | 求职仓库 UI 方案确认 | 只产出导航、信息层级、页面状态和窄窗口方案，用户确认前不实现 UI | ✅ 已完成 |
| J2 | JD / Resume 展示接入 | 将简历仓库扩展为可发现全部 JD 与关联 Resume 的求职仓库 | ✅ 已完成 |
| J3 | JD / Resume / Tracker 闭环 | 从 JD/Resume 发起投递，Application 同时引用两者并冻结标题与实际 Resume 内容指纹 | ✅ 已完成 |
| E0 | 经历仓库体验与领域规则 | 冻结时间线、日期、筛选、归档、下游使用和 pending revision 规则 | ✅ 已完成 |
| E1 | Experience Store / IPC | update、archive/restore、soft-delete、Proposal、校验、Outbox 和冲突恢复调用面 | ✅ 已完成 |
| E2 | 经历时间线页面 | 经用户确认方案后接入入口、时间线、搜索、筛选、详情与同步状态 | ✅ 已完成 |
| E3 | 经历维护体验 | 新建、编辑、归档、恢复、删除及不可变 revision 写入闭环 | ✅ 已完成 |
| E4 | 导入闭环 | ApprovalCard 导入完成后进入经历仓库并定位本次写入项 | ✅ 已完成 |
| E5 | 版本记录 | 在线分页历史、pending 本地版本说明和恢复为新 revision | ✅ 已完成 |
| E6 | 经历仓库验收 | Electron + Docker、离线、冲突、日期、可访问性、跨账号与性能回归 | ✅ 已完成 |
| S4 | Tracker 业务闭环 | 独立接入 Interview、Note、Reminder、状态历史与本地通知 | ✅ 已完成 |
| S4.5 | 简历生成与交付修复 | 个人资料、可扩展内容、教育排版、三分钟生成目标与预览直接导出 | 待确认后执行 |
| S5 | 全产品联调与性能验收 | 对 P1–P4、J0–J3、E0–E6、S3–S4.5 做最终真实主路径和失败路径验收 | Section A 已完成；其余暂停至 S4.5 完成 |
| R1 | 生产上线准备 | 邮件、限流、域名、备份、监控、密钥、发布与回滚 | 功能路线完成后执行 |

#### N0 冻结联调基线完成记录（2026-07-28）

- **App commit**: `283d486` — S1/S2 Experience & JD sync-store baseline
- **Backend commit**: `52edd98` — Experience date-precision baseline (migration 00008)
- **Migration version**: 00008 (00001–00008 全部 applied)
- **Contract snapshot**: `contracts/app-v1/source-manifest.json` 17 个源文件 SHA-256 通过检查
- **验证证据**：
  - App `npm run check` 全绿（typecheck + desktop:typecheck + 196 tests + build + desktop:build）
  - Backend `make check` 全绿（contract-lint + gofmt + vet + build + 行数检查 + compose config）
  - Backend `make test` 全绿（-race，含 experience/identity/jd/profile/resume/tracker domain tests）
  - `make contract-source-check`：17 个权威源文件 SHA-256 全部匹配
  - 行数约束：最大业务文件 `jd/httpapi/handler.go` 224 行（<250 硬上限）
- **工作树范围**：App 46 个修改文件 + 15 个新增文件（sync kernel、ExperienceSyncStore、JdSyncStore、映射、测试）；Backend 12 个修改文件 + 2 个新增文件（date 精度、migration 00008、domain 校验、文档）

#### N1 真实 App 验收清单

1. 使用 Mailpit 完成邮箱验证码注册、登录、退出和重新登录；
2. 创建并查看 Resume，重启 App 后仍能从本地 projection 读取并完成 Push/Pull/Bootstrap；
3. 创建、搜索 Experience，确认 `YYYY-MM`/`YYYY-MM-DD`/`present` 精度不丢失；
4. 创建 JD，并确认匹配分析和简历生成仍可读取稳定 requirement；
5. 断网创建 Experience/JD，确认 UI 显示 pending，恢复网络后同步一次且仅一次；
6. 切换两个账号，确认 SQLite、Outbox、冲突和失败记录按账号隔离；
7. 记录失败步骤、日志和复现条件；阻塞主路径的问题在进入 S3 前修复并写回本 README。

##### N1 首次实测记录（2026-07-28，修复前未通过）

- **测试环境**：App `283d486`；Backend 当前 HEAD `ef439ee`（包含 N0 记录 commit，
  业务基线仍为 `52edd98`）；Compose 锁定的 PostgreSQL `18.4-bookworm`、Redis
  `8.0.6-alpine`、Mailpit `v1.30.5` 已重新 pull，镜像摘要未变化；API 按当前源码重建。
  `/health/live`、`/health/ready` 均返回 200，Migration `00001`–`00008` 全部 applied。
- **阶段质检**：实测完成后再次运行 App `npm run check`，196/196 tests、Node/renderer
  typecheck、Node/Electron build 全部通过。该结果同时证明现有静态门禁未覆盖真实 preload 对
  `DesktopApi` 的完整实现，Resume Library 缺口只能在 Electron 运行时暴露。
- **通过项**：
  - Mailpit OTP 使用两个新账号完成注册/登录、退出与重新登录；账号切换后会话和本地业务数据
    未串用。
  - App 审批创建两条 Experience 后搜索返回 `clean`；PostgreSQL 仅各有一条 version=1，
    `2022-01 → present` 与 `2020-02-03 → 2021-04-05` 原样保留。
  - App 创建 JD 后自动续接匹配分析，得到 82 分报告；简历生成 source snapshot 读取的三个
    requirement ID 与 PostgreSQL 中的 ID 完全一致，未重新生成或漂移。
  - 仅停止 API 容器时，App 创建 Education Experience 与第二份 JD；本地搜索分别显示
    `pending`，离线 JD 的两个 requirement ID 可从 SQLite projection 读取。
  - 断网时 SQLite 为 Experience/JD 各一条 pending Outbox，后端数量保持 Experience=2、JD=1；
    关闭 App 后记录仍在。恢复 API 并重启 App 后 Outbox 清空、projection 全部 `clean`，后端变为
    Experience=3、JD=2，离线 JD/requirement ID 与本地完全一致，没有重复创建。
  - 两账号使用两个独立 SQLite 目录：账号 A 为 Experience=3、JD=2，账号 B 仅有自己的
    `user_profile`；B 的 Outbox/conflict/failure 均为 0，A 的断网失败历史没有串入 B。
  - 真实 Chromium 生成了“桌面端同步质量工程师”本地 Resume 草稿；App 可打开预览，退出重启后
    草稿仍出现在侧栏并可再次打开。测试素材只有三段短正文，页面占用 26.7%，质量门正确保持
    `needs_revision` 并禁用云端保存，这属于测试数据不足，不绕过质量门。
- **阻塞问题（进入 S3 前必须修复并复验）**：
  1. **Resume Library 无法打开（主路径阻塞）**：使用已有云端 Resume 的开发账号打开“简历仓库”
     立即显示 `Cannot read properties of undefined (reading 'list')`。根因已定位为
     `src/desktop/preload/index.ts` 的真实 `DesktopApi` 未暴露必需的 `library` namespace，renderer
     却直接调用 `desktopApi.library.list()`；当前 `desktop:typecheck` 未覆盖 preload，所以 N0 静态门禁
     没有发现。该问题阻断 Resume Bootstrap/Pull、云端列表、rename/archive 与云端/本地合并实测。
  2. **离线冷启动不可用**：有有效本地 Session 且 Outbox 已持久化时，在 API 停止状态重启 App，
     登录页显示 `TypeError: fetch failed`，无法进入本地 projection；恢复 API 后需要再次重启才会
     恢复 Session 并重放 Outbox。数据没有丢失，但“不联网仍可重启浏览本地数据”的用户路径未通过。
- **非阻塞缺陷**：JD 审批接受并已完成匹配后，当前会话中的 JD 卡片仍显示“等待确认”；不影响
  JD projection、匹配或 Resume source snapshot，但状态展示与事实不一致。
- **当时阶段结论**：N1 不能标记完成，S3 暂不开始。先修复 Resume Library preload 接线，并决定/修复
  离线冷启动的 Session 恢复策略；修复后至少复验 Resume cloud Bootstrap/Pull、仓库列表、断网冷启动
  和 JD 卡片状态。此次仅实测和写回文档，不修改业务代码、不 commit。

##### N1 阻塞修复与真实 App 复验（2026-07-28，已通过）

- **Resume Library**：真实 preload 补齐 `library` IPC namespace，并新增 preload + shared 契约类型检查，
  防止 renderer 声明与 Electron 实际暴露再次漂移。开发账号真实打开仓库后可列出两条 Bootstrap
  云端 Resume；同时兼容历史 Resume 的空 `score: {}`，缺失分项按未评分 `0` 读取，非数值仍拒绝。
- **离线冷启动**：加密 Session 保存已验证的最小用户/设备身份。在线成功启动升级旧 Session 后，完全
  停止 API、退出并重启 App，真实 Electron 直接进入 `dev@example.com` 工作区并读取本地对话；401
  或服务端协议错误不会使用离线回退，只有 fetch/abort/timeout 网络失败允许回退。
- **JD 状态**：审批完成后由 main 发出显式 `jd.saved` 领域事件，renderer 以不可变方式替换卡片状态。
  真实 App 创建并接受“最终状态回归”JD 后，卡片从“等待确认”变为“已保存，等待同步”。
- **消息卡片锚定**：Resume/JD/Match 卡片记录首次产生时的 assistant message ID；已有 Resume 引用按
  创建时间稳定回填。真实 App 在 JD 后继续发送普通消息，旧卡片仍紧跟原 assistant 消息，未移动到
  最新回复；已完成的流式文本/tool activity 同时清理，不再重复渲染一份回复。
- **阶段质检**：新增 artifact anchor、离线 Session 策略、历史 Resume score 共 7 个回归测试；
  `npm run check` 全绿（203/203 tests，Node typecheck，preload/shared typecheck，renderer typecheck，
  Node build，Electron build）。Docker API 恢复运行并通过 live/ready 健康检查。
- **阶段结论**：首次实测的两个阻塞和 JD 状态缺陷均已修复，新增的卡片消息位置问题也已通过真实
  Electron 复验；结合首次验收已通过的 OTP、Experience/JD 离线重放、账号隔离与本地 Resume 重启
  持久化证据，N1 标记完成。此次未 commit。

##### N1 历史消息展示隐私复验（2026-07-28，已通过）

- **边界明确**：加密 Agent transcript 是恢复执行上下文的内部事实源，不等同于 App 聊天记录；UI
  只投影用户真实输入与 assistant 面向用户的输出。system/tool 消息、宿主 continuation prompt、
  Resume reference 元数据及其中的内部 ID 不进入聊天投影，审批/业务状态继续由结构化卡片承载。
- **新旧兼容**：JD 保存和浏览器写权限 continuation 统一使用 `<coolto_internal_continuation>` 标记，
  并明确要求 Agent 不复述内部指令或标识；历史上尚未带标记的两类 prompt 按旧模板兼容过滤，旧文件
  不需要删除或改写，Agent 重启仍保留完整上下文。
- **真实 App 复验**：使用原 `Electron` userData 重启并读取 `dev@example.com` 的真实历史，13 条正常
  消息继续展示，页面中 `jdId:`、JD 续执行控制语和 `browser_start_review` 均未出现。
- **阶段质检**：新增 3 个 conversation presentation 回归测试；`npm run check` 全绿（206/206 tests，
  Node/preload/renderer typecheck 与 Node/Electron build 全部通过）。此次未 commit。
- **空白新对话去重回归（2026-07-28）**：用户明确规则为已有标题“新对话”且消息数为 0 的空白会话时，
  点击“新对话”不得再创建记录；从简历仓库、投递追踪或其他会话触发时改为切回现有空白会话。
  Renderer 增加纯列表判定和创建并发锁，避免快速连点绕过去重。真实 Electron 从投递追踪连续点击两次，
  会话总数保持 8、Tracker 关闭并切回“新对话”；新增 2 个回归测试，`npm run check` 全绿
  （223/223 tests，全部类型检查和构建通过）。

#### S3 实施拆分

1. 先锁定 Application App 类型、后端 payload、状态枚举和合法迁移契约；
2. 单独实现纯 Mapper/Normalizer，不依赖 Electron，覆盖投影、墓碑和标题快照；
3. 实现职责单一的 `ApplicationSyncStore`，复用通用 LocalSyncStore/Outbox，不向同步内核加入 Tracker 分支；
4. 接入 Application 创建、看板和详情，再接 update/delete/transition；
5. 真实 Docker 联调离线恢复、重放、陈旧版本、父资源引用与跨账号隔离；
6. 通过质检并写回本 README 后，才进入 S4。

##### S3 非 UI 基础完成记录（2026-07-28）

- **契约冻结**：新增 `src/tracker/types.ts` 与 `application-status.ts`，锁定 Application、
  status event、Interview、Note、Reminder 的 App 类型；Application 状态枚举、合法边和三种终态
  与后端 `tracker/domain` 一致。创建不伪造初始 status event，通用 update 不修改 status。
- **纯映射与校验**：新增独立 `application-sync-mapping.ts` 和
  `application-sync-normalizer.ts`，create/update/transition 的 push key 与后端
  `tracker/syncadapter` 的 `DisallowUnknownFields` payload 对齐；本地投影、严格枚举校验、墓碑、
  JD/Resume 标题快照、看板筛选和游标分页均可在 `node --test` 下验证。
- **聚合根 Store/Adapter**：新增职责单一的 `ApplicationSyncStore`，Application 的
  create/update/transition/delete 统一写入既有 LocalSyncStore/Outbox，读取本地 projection；
  没有向同步内核加入 Tracker 分支。新增独立 IPC Adapter 和 preload namespace，renderer
  尚未引用，因此本记录不包含任何 UI 布局或样式实现。
- **模块边界**：Interview、Note、Reminder 目前只冻结类型，未塞入 Application Store；后续仍按
  S4 拆成各自 Mapper/Store/Adapter。status event 只接收服务端 projection，不在 App 构造第二套历史。
- **自动质检**：新增 9 个测试，覆盖字段白名单、本地投影、非法枚举、状态边、终态、分页、墓碑、
  Outbox create/update/transition/delete 和本地引用标题。`npm run check` 全绿：215/215 tests，
  Node/preload/renderer typecheck、Node build 与 Electron build 全部通过；所有新业务文件均低于
  250 行硬上限，其中 `ApplicationSyncStore` 为 232 行，其余均不超过 220 行目标。
- **真实 Docker 契约 smoke**：使用现有 JD `019fa6d3-dc3d-71b9-9d14-0a829a18f19b` 与 Resume
  `019fa329-38d3-7065-903b-83e8cf22c882` 创建 Application：create `applied/v1`，服务端快照分别为
  “UI 回归工程师”与“Renamed”；合法 transition 到 `screening/v2`；非法
  `screening→offer` 返回 `validation_failed/illegal_transition`；最终软删除为 v3，测试记录已清理。
- **待完成**：看板/详情/创建与编辑 UI 必须先由用户确认方案；确认后再接 renderer，并继续真实 App
  验收离线重启重放、Pull/Bootstrap、陈旧版本冲突和跨账号隔离。S3 尚未标记完成，也未进入 S4。

##### S3 A1 看板与详情完成记录（2026-07-28）

- **用户确认方案**：采用 A1——侧栏增加“投递追踪”，主体为“已投递 / 筛选沟通 / 面试 / 结果”
  四列紧凑看板；结果列合并 `offer/rejected/no_response` 但卡片保留精确状态；点击卡片打开右侧
  详情抽屉；通过“推进状态”菜单选择合法目标并二次确认，不实现拖拽迁移。
- **Renderer 接入**：新增职责拆分的看板列、卡片、创建弹窗、详情抽屉、编辑字段、状态菜单、
  迁移确认和删除确认组件；侧栏入口与现有对话/简历仓库互斥。样式复用既有颜色 token、按钮、
  字体、圆角和间距语义，未引入第二套主题。创建/编辑可关联现有 JD、Resume，并显示冻结标题快照。
- **状态与写入边界**：卡片只展示本地 projection；create/update/transition/delete 全部经过
  `desktopApi.applications` 和 `ApplicationSyncStore/Outbox`。通用编辑不含 status；状态菜单只暴露
  当前状态的后端合法边；终态不显示推进入口；转移和删除均要求显式确认，服务端错误保留在对应操作面。
- **自动测试**：新增 3 个 A1 UI model 测试，覆盖四列结果分组、手工创建 payload 和详情编辑不夹带
  status。修复浏览器预览 API 的 Application 内存实现，以便无 Electron 桥接时完成可见交互验收。
- **可见界面实测**：使用隔离的本地预览和 Browser 控制依次验证侧栏入口、四列与计数、创建一条
  “A1 验收公司 / Tracker 验收工程师”记录、关联 JD/Resume、打开右侧详情、从 `applied` 选择
  `screening`、确认前状态不变、确认后跨列移动、删除确认与记录清理；未操作用户当前 Mailpit 页面，
  测试数据只存在于隔离预览内存。实测同时发现并修复 demo API 初始化顺序导致的预览白屏。
- **开发账号展示数据（2026-07-28）**：经正式 `/v1/sync/push` 为 `dev@example.com` 写入 5 条
  可重复识别的 Tracker 样例，分别覆盖 `applied/screening/interviewing/offer/rejected`，并关联现有
  “UI 回归工程师” JD 与 “Smoke Resume” 标题快照；所有 create/transition 均返回 `applied`，版本
  依次符合状态迁移链。原有 3 条 active Smoke 记录未删除；当前 Electron preview 已启动供人工查看。
- **本地端口修复（2026-07-28）**：真实 Electron 登录日志确认 App 仍默认连接
  `127.0.0.1:8000`，而统一 Docker API 暴露在 `127.0.0.1:8080`，因此产生
  `ECONNREFUSED/fetch failed`。App 默认 `COOLTO_API_BASE_URL` 与 `.env.example` 已统一改为 `:8080`，
  环境变量覆盖能力保留；修复后 `npm run check` 全绿（218/218 tests 与全部构建通过）。
- **阶段质检**：白屏修复后重新执行 `npm run check`，218/218 tests、Node/preload/renderer typecheck、
  Node build 与 Electron build 全部通过；`git diff --check` 通过；看板、卡片、表单样式按职责拆分，
  单文件分别为 183/77/134 行，均低于 250 行硬上限。S3 仍保持进行中，下一步只补真实
  Electron + Docker 下的离线重启重放、Pull/Bootstrap、陈旧版本冲突、非法迁移错误展示和跨账号隔离，
  通过后才可标记 S3 完成并进入 S4。

##### S3 A2 时间轴与日历完成记录（2026-07-28）

- **用户确认方案**：在 A1 看板基础上增加“看板 / 时间轴 / 日历”顶部切换，不替换现有入口、卡片和
  详情交互；四阶段颜色固定为已投递琥珀、筛选沟通蓝、面试紫、结果绿，结果阶段仍以文字徽标区分
  `offer/rejected/no_response`，没有用同一种结果色掩盖精确状态。
- **真实数据边界**：时间轴只根据真实 `appliedAt` 和当前状态展示已达到阶段，不伪造阶段起止时间；
  日历当前只按真实投递日期落点，并支持上月、下月和返回今天。状态历史区间、面试日程和提醒事件
  留在 S4 接入对应实体后增强，界面已明确提示该边界。
- **Renderer 实现**：新增独立视图切换器、时间轴、日历组件和纯日历模型；看板列、卡片、图例、时间轴
  节点与日历事件共用同一阶段颜色映射，并为暗色主题提供对应 token。点击日历事件继续复用 A1 详情
  抽屉，没有建立第二套详情或写入路径。
- **自动与可见质检**：新增 3 个 UI model 测试，覆盖精确状态到四阶段映射、42 格周一开头月历、真实
  投递日期落点、初始月份和月份切换；`npm run check` 全绿（221/221 tests，全部类型检查和构建通过）。
  使用隔离本地预览逐项验证三种视图切换、五条开发样例、月份导航、日历事件打开详情、四种颜色计算值
  互不相同，浏览器控制台无错误。
- **丰富展示数据（2026-07-28）**：经正式 Sync Push 为 `dev@example.com` 新增 18 条不重复 Application，
  投递日期覆盖 2026-06-12 至 2026-07-28；状态分布为 `applied/screening/interviewing` 各 4 条，
  `offer/rejected/no_response` 各 2 条，并混合官网、邮件、手工和其他投递来源。数据库只读回查确认
  18 条全部存在；开发账号当前 active 总数为 26 条，随后已重启 Electron App 触发同步展示。
- **用户复核微调（2026-07-28）**：按用户对真实数据看板截图的确认，移除四栏顶部阶段色描边，并删除
  返回按钮旁的“投递追踪”标题及说明文字；阶段颜色仍保留在状态徽标、图例、时间轴和日历事件中。
  搜索框改为自动靠右，避免标题删除后留下错位。可见回归确认标题节点为 0、栏目阴影为 `none`，
  返回、搜索、刷新和记录投递操作均保留；`npm run check` 再次全绿（221/221 tests 与全部构建通过）。
- **滚动体验修复（2026-07-28）**：日历日期格内的事件区改为独立纵向滚动，单日投递过多时不再被
  截断；看板容器、看板栏目、日历网格和日期事件区均隐藏可见滚动条，同时保留鼠标滚轮、触控板和
  触屏滚动能力。隔离预览在 7 月 28 日写入 8 条同日记录后实测，日期事件区可从 `scrollTop=0`
  滚至 `150.5`（最大值约 `150`），看板最长栏目可滚至 `663.5`（最大值约 `664`）；两处计算样式
  均为 `scrollbar-width: none` 且可见滚动条宽度为 0。修复后 `npm run check` 全绿（221/221 tests、
  全部类型检查和构建通过）。
- **文件边界与阶段结论**：`ApplicationTrackerView.vue` 为 197 行，新时间轴/日历组件均低于 80 行，
  `tracker-views.css` 为 250 行，未超过 250 行硬上限。A2 完成不等于 S3 完成；下一步仍是 Electron +
  Docker 的离线重启重放、Pull/Bootstrap、陈旧版本冲突、非法迁移错误展示和跨账号隔离实测。

##### S3 真实 Electron + Docker 验收完成记录（2026-07-28）

- **离线增改删与重启重放**：关闭 Docker API 后，通过真实 Electron App 分别创建、编辑、迁移和删除
  四条专用 Application；SQLite 中形成 `create/update/transition/delete` 四条 pending Outbox，服务端
  数据保持不变。API 仍离线时重启 App，三条可见 projection、删除墓碑及四条 Outbox 均保留；恢复
  API 后由同步周期自动重放，create、update、`applied→screening` 和 delete 全部落库且版本连续，
  Outbox 清空，没有重复创建。
- **Pull 与陈旧版本冲突**：第二测试设备经正式 `/v1/sync/push` 创建 Application，真实 App 在下一次
  Pull 周期自动出现 `v1/clean` 记录。随后 App 离线提交基于 v2 的本地更新，第二设备先写入远端 v3；
  App 恢复网络后将本地记录标记为 `conflict`，Outbox 与 `sync_conflicts` 均记录
  `entity_version_conflict`，看板显示“同步冲突”且保留本地版本，没有静默覆盖。
- **非法迁移 fail-closed**：`applied` 卡片菜单只显示合法的“筛选沟通 / 已拒绝 / 无回应”，不提供
  `offer`；强制调用真实 IPC 的 `applied→offer` 返回“非法投递状态迁移”且不写 Outbox；第二设备直接
  Push 同一非法迁移返回 `validation_failed/illegal_transition`，App 记录仍为 `applied/v1/clean`。
  因正常 UI 不会产生非法请求，服务端错误仅在强制契约调用中出现，用户路径由菜单与本地守卫提前拦截。
- **Bootstrap 重建**：退出 App 并为本地同步库建立临时可恢复备份后，精确清除本轮冲突测试行与
  `sync_state`，再由真实登录触发 Bootstrap。重建后开发账号恢复 26 条原有 active Application，全部
  为 `clean`，本轮已软删除测试记录未复活；本地状态回到 `pull`，Outbox 与冲突表均为 0。
- **跨账号隔离**：使用 Mailpit OTP 创建专用 B 测试账号；首次登录列表为 0，无法看到 A 账号 26 条
  数据。B 创建并同步一条记录后切回 `dev@example.com`，A 仍为 26 条且看不到 B；再切回 B 只恢复
  自己的 1 条记录且看不到 A。数据库回查确认记录 `user_id` 属于 B；测试记录随后经真实 App 软删除，
  最终回到开发账号 26 条全 `clean` 基线。
- **阶段质检**：Docker API `/health/live` 与 `/health/ready` 均通过；`npm run check` 全绿（223/223
  tests、Node/preload/renderer typecheck、Node build 与 Electron build），`git diff --check` 通过；
  新业务文件继续满足 250 行硬上限，最大为 `tracker-views.css` 250 行、`ApplicationSyncStore` 232 行。
- **阶段结论**：S3 全部门槛通过，测试业务记录已清理，App 保持登录 `dev@example.com` 并恢复原有
  26 条 Tracker 展示数据。S3 标记完成；按统一路线下一阶段进入 A0。此次仅写回文档，未 commit。

## 统一产品关系（2026-07-28，用户确认）

- Experience 是独立、可复用的长期事实资产，不永久隶属于 JD、Resume 或 Application；
- JD 表示一次岗位目标；一个 JD 可以关联多份针对性 Resume，也可以在尚未生成 Resume 时独立存在；
- Resume 是针对岗位准备的交付物；现有单数 `jdId` 表示最多绑定一个 JD，通用 Resume 可以不绑定；
- `Resume.jdId` 只表示一个主要目标 JD；任何 Resume 都可以通过不同 Application 实际投递多个 JD，
  该投递关联不反向增加或改写 Resume 的主要目标绑定；
- Application 是一次真实投递事实，同时保存 `jdId`、实际提交的 `resumeId` 以及两者标题快照；
- Interview、Note、Reminder 属于 Application；状态事件只由 Application transition 产生；
- JD 和 Resume 页面可以展示由 Application 派生的投递摘要，但不得各自保存第二套投递状态；
- 归档或重命名 JD/Resume 不改写历史 Application；历史记录继续使用投递时冻结的标题快照；
- 匹配分析和 Resume 只通过稳定 source snapshot/revision 引用 Experience，不建立 Experience 归属关系。

## 统一阶段详情与确认点

### A0：架构与工程治理

**实施内容**：统一根索引与阶段文档状态；审计并拆分超过 250 行的业务 TypeScript、Vue 和 CSS 文件；
为 `npm run check` 增加 250 行硬门禁；把顶层页面切换收敛为单一导航状态；按领域拆分共享类型、
Desktop API/demo、IPC 注册、Vue 状态和样式，禁止创建新的 `Manager/Helper` 式上帝模块。

**阶段开始前确认**：仅当生成文件、不可拆测试 fixture 或第三方同步资产需要例外时，先列出精确文件、
理由和替代方案向用户确认；其他超限业务文件不设例外。若拆分会改变公开 import 或运行时边界，也先确认。

**完成门槛**：全量行数门禁、`npm run check` 和 `git diff --check` 通过；功能行为不变；每个新模块能用
单一职责命名；完成记录写回本 README。

**完成记录（2026-07-28）**：

- 根 `AGENTS.md` 已同步本 Roadmap 的唯一入口、实体关系、固定顺序、UI 前置确认和门禁命令；项目没有
  自有 `.codex/AGENTS.md`，用户级同名文件均为插件缓存或模板，未修改。
- 审计并消除 `src/` 下 15 个超过 250 行的 TypeScript、Vue、CSS 与 fixture 聚合文件；共享类型、
  Desktop API Demo、Agent Runtime、用户服务构造、对话持久化、聊天状态、浏览器窗口、Resume fixture
  和 Renderer 样式均按领域/职责拆分，原公开 import 通过 facade 或 re-export 保持不变。
- `base.css` 由 2904 行聚合文件拆为 18 个按原顺序导入的样式模块；重组后与阶段开始时的工作树样式
  等价，只保留原有 `.new-chat-button.active` 4 行改动，没有新增布局、主题、颜色或交互方案。
- 顶层页面从 `libraryOpen`、`trackerOpen` 两个互斥布尔值收敛为单一
  `activeView: "chat" | "library" | "tracker"`；聊天工作区和状态逻辑分别进入职责单一组件/composable。
- 新增 `npm run check:source-lines`，递归检查 `src/` 全部 `.ts/.vue/.css`，超过 250 行或混入已知 shell
  日志即失败；该门禁已接入 `npm run check`，无文件例外。
- 验证：`npm run check` 全绿，包括模板快照、364 个源文件行数门禁、Node/Renderer 类型检查、
  223/223 单测、Node build 和 Electron build；`git diff --check` 通过。没有 commit/push。
- A0 完成；下一阶段进入 J0。J0 表格中的产品语义确认点必须在开始实现关系聚合前向用户确认。

### J0–J3：求职仓库与投递关系闭环

| 阶段 | 实施内容 | 到阶段再确认的点 | 完成门槛 |
| --- | --- | --- | --- |
| J0 关系模型 | 建立职责单一的求职资产只读聚合，基于本地 JD、Resume、Application projection 计算关联 Resume 数量和投递摘要；不新增后端关系表，不向任一 Store 塞跨域规则 | 通用 Resume 的使用边界；已产生 Application 后能否改绑 JD；未关联 JD/Resume 的手工 Application；JD/Resume 归档、删除和历史引用行为 | 一对多关系、标题快照和空关联均有纯模型测试；页面尚未接入；无第二套状态 |
| J1 UI 方案确认 | 只产出求职仓库导航、信息层级、主要操作、页面状态和窄窗口方案，不写 UI | 侧栏名称使用“求职仓库”还是保留“简历仓库”；简历/JD 的切换方式；列表与详情布局；空态、加载、失败、冲突；940px 与 200% 缩放行为 | 用户逐项确认并写回方案；确认前不得进入 J2 |
| J2 展示接入 | 按 J1 已确认方案展示全部 Resume、全部 JD、无 Resume 的 JD、无 JD 的通用 Resume、关联数量、同步状态和派生投递摘要 | 实现中若需偏离 J1 布局、文案、交互或主题，必须暂停确认；不得用临时硬编码替代未决方案 | 深浅主题一致；复用 `tokens.css`、既有图标和通用控件；所有数据来自本地 projection；无新硬编码主题 |
| J3 跨模块闭环 | 从 JD 进入匹配/生成 Resume；从 JD 或 Resume 创建预填 Application；从 Tracker 返回对应资产；所有写经不可变 Proposal、审批、Outbox 和乐观锁 | 已确认通用 Resume 可直接投递多个 JD，错误关系只显式纠正 Application 引用且不复制/取消，内容因新 JD 改变时才另存 Resume；主操作、软重复提示、`contentHash` 快照、双向返回和筛选保留方式均已确认并实现 | Application 同时记录 JD/Resume、标题快照和实际提交 Resume 的稳定版本引用；JD/Resume 只展示派生状态；离线和冲突不丢关联 |

**J0 确认结果（2026-07-29，用户确认）**：

- 通用 Resume 保持 `jdId = null`，可以原样用于不同 JD 的 Application；该次使用不反向建立或修改
  Resume→JD 绑定，也不计入 JD 的关联 Resume 数量。
- 关系录入错误时允许未来通过显式纠错修正原 Resume/Application，不以复制掩盖错误；通用 Resume 原样
  复用也不复制。只有针对新 JD 改变了 Resume 内容时，才另存为新的 Resume 交付物。
- J0 兼容既有 `jdId`/`resumeId` 为空或部分缺失的 Application，将其列为未完整关联，不把缺失引用
  计入资产摘要；J3 再收紧新的正式投递必须同时选择 JD 和实际 Resume。
- 归档资产继续参与历史聚合，但不进入新的默认选择列表；删除不级联、不改写 Application，引用资产
  缺失时保留冻结标题快照并明确缺失关系；未来被引用资产只允许软删除。
- 投递摘要只包含总数、六种精确状态计数和最近一次投递的 ID、状态、时间，不派生第二套业务状态。
- 已识别的 J3 必补缺口：`resumeId` 和标题快照不足以锁定实际投递内容；跨模块写入阶段必须确认并实现
  Application 对实际提交 Resume 版本的稳定引用，不能依赖会被后续覆盖的当前 Resume 内容。

**J0 完成记录（2026-07-29）**：

- 新增 `src/job-assets/types.ts`、`application-summary.ts` 和 `projection.ts` 三个纯模型模块，分别负责
  最小只读契约、精确投递摘要和跨 projection 关系聚合；没有新增类、Store、后端关系表、IPC 或 UI。
- JD 的关联 Resume 只由 `Resume.jdId` 计算；Application 分别按自己的 `jdId`、`resumeId` 向 JD 和
  Resume 派生摘要。通用 Resume 的实际投递、关系错配均不会反向推断或改写 Resume→JD 绑定。
- 聚合保留归档 Resume，排除已删除 projection；通用 Resume、引用已删除 JD 的 Resume 分开输出；
  Application 的 JD/Resume 引用精确区分 `linked`、`empty`、`missing`，删除不级联且标题快照不被现名替换。
- 摘要只包含投递总数、`applied/screening/interviewing/offer/rejected/no_response` 六种状态计数和
  最近一次投递事实；最近时间优先使用 `appliedAt`，缺失时使用 `createdAt`，同时间以 ID 稳定决胜。
- 新增 6 个纯模型测试，覆盖一对多、归档 Resume、通用 Resume 跨 JD 使用、关系错配、空关联、删除
  引用、删除 Application、标题快照、六种精确状态和最近投递排序。
- 阶段质检通过：专项测试 6/6；`npm run check` 全绿，包括模板快照、367 个源文件 250 行门禁、
  Node/Renderer 类型检查、229/229 单测、Node build 和 Electron build；`git diff --check` 通过。
  三个新业务文件分别为 84、49、121 行，均低于 220 行目标；没有 commit/push。
- J0 完成且页面尚未接入；下一阶段进入 J1，只确认求职仓库 UI 方案，用户确认前不得开始 J2。

**J1 最终确认方案（2026-07-29，用户确认）**：

- **导航**：侧栏“简历仓库”更名为“求职仓库”；“投递追踪”保持独立；“本地简历”继续作为最近编辑
  草稿快捷入口，不承担完整仓库职责。求职仓库默认进入“岗位”视角。
- **视角切换**：复用 Tracker 的分段切换器提供“岗位 / 简历”，不增加全局二级入口或左右分类导航。
  岗位视角搜索公司、岗位和 JD 标题，筛选有/无 Resume、已有投递和同步冲突；简历视角搜索标题和
  目标岗位，筛选针对性、通用、归档、仅本机和同步冲突。Application 状态只展示，不复制 Tracker 筛选。
- **宽屏布局**：大于 940px 使用左侧资产列表、右侧详情的主从布局。岗位列表展示 JD 基本信息、
  针对性 Resume 数、投递总数、最近精确状态/时间和同步状态；详情依次展示基本信息、投递概览、
  Resume 关系、最近投递和可折叠 JD 要求/原文。
- **双层 Resume/JD 关系**：Resume 最多有一个“主要目标 JD”，但无论是否通用，都可通过多条
  Application 实际投递多个 JD。Resume 详情同时展示主要目标 JD 和实际投递过的 JD；JD 详情明确区分
  “为本 JD 定制的 Resume”与“实际投递时使用的其他 Resume”。投递关系只由 Application 派生，
  不建立多对多关系表，也不反向改写 `Resume.jdId`。内容未改变时复用同一 Resume；为新 JD 针对性修改
  内容时才另存新 Resume。
- **简历视角**：主结构由大面积缩略图网格改为信息列表，展示标题、目标岗位、主要 JD/通用属性、
  同步与归档状态、投递次数和最近投递；详情展示基本信息、双层 JD 关系、投递历史和现有预览/打开入口。
- **操作分期**：J2 只接入搜索、筛选、视角切换、打开 Resume、查看 JD 和只读关系摘要，不放无效占位
  按钮；J3 再增加匹配/生成 Resume、记录投递、过滤后跳转 Tracker、显式纠错和实际投递版本锁定。
- **页面状态**：复用现有居中加载、空态、错误提示、同步标签、危险色和 Tracker 精确状态颜色；无
  Resume 的 JD 是正常空态，通用 Resume 使用中性标签，缺失引用展示冻结标题和“引用资产已缺失”，
  归档资产弱化但保留。不得新增“进行中”等第二套 Application 状态。
- **窄窗口与缩放**：不大于 940px 改为单列列表，选中后进入完整详情并可返回；200% 缩放等效窄宽度
  下全局侧栏默认收起，以现有侧栏按钮作为覆盖层入口；极窄窗口纵向排列标题、搜索、切换和筛选，页面
  本身不得横向滚动。不得复制 Tracker 在 940px 下横向裁切列的行为。
- **主题与契约边界**：只复用 `tokens.css`、Lucide、现有分段切换器、同步标签、详情面板和 Tracker
  状态语义，不增加配色、字体、主题或图标系统。当前 JD projection 没有归档字段，J2 不伪造 JD 归档；
  只展示真实存在的 Resume 归档与 JD 缺失引用，待真实契约存在后再接入 JD 归档。

**J1 完成记录（2026-07-29）**：

- 已在真实现有深色界面复核聊天、简历仓库和 Tracker，并检查 1280px、940px、640px 等效宽度；确认
  现有简历缩略图网格无法表达 JD/Application 关系，Tracker 横向列方案不适合复制到求职仓库。
- 用户逐项确认上述导航、信息层级、操作分期、页面状态、主题和响应式方案，并仅将 Resume/JD 关系
  调整为“一个主要目标 JD + 可实际投递多个 JD”的双层关系；本阶段没有实现或修改任何 UI。
- 文档质检通过：方案覆盖 J1 表格中的全部确认点，J0 聚合语义、J2 展示范围和 J3 写入边界一致；
  `git diff --check` 通过。J1 完成；下一阶段进入 J2，实施必须严格按本方案，偏离时暂停向用户确认。

**J2 完成记录（2026-07-29）**：

- 侧栏入口已更名为“求职仓库”，默认岗位视角；新增岗位/简历分段切换、随视角变化的搜索与筛选、
  刷新、加载/错误/全空/筛选空态。页面只提供 J2 已可用的只读操作，没有提前放置 J3 占位按钮。
- 新增职责分离的只读仓库 projection、关系辅助函数、Main 读取服务和独立 IPC；读取全部 JD、Resume
  Library 和 Application 本地 projection，JD/Application 使用 500 条游标分页并拒绝重复游标，不新增
  Store、关系表或第二套投递状态。
- Resume 详情分别展示一个主要目标 JD 与由 Application 派生的实际投递 JD；JD 详情分别展示
  `Resume.jdId` 决定的针对性 Resume 与实际投递使用的其他 Resume。通用 Resume 实际投递后仍保持通用，
  归档、本机、空引用和缺失引用均保留真实语义与冻结标题。
- 宽屏为列表/详情主从布局；不大于 940px 时切换为列表和详情单页并提供返回；不大于 820px 时侧栏
  默认收起并以覆盖层打开。所有样式复用现有 token、Lucide、分段切换器、同步标签和 Tracker 精确状态，
  深浅主题一致，没有新增主题、字体或伪造 JD 归档状态。
- 自动质检新增 7 项关系、分页和 IPC 测试；最终 `npm run check` 全绿：387 个源码文件全部不超过
  250 行，Node/Renderer 类型检查通过，236/236 单测通过，Node 与 Electron 构建通过。新增业务代码和
  样式文件最长 220 行，没有上帝类、万能 Store 或万能 Manager。
- 真实 Electron 使用现有登录账号完成只读验收：宽屏读取 4 个 JD、2 个 Resume 和 5 条投递样本；
  验证岗位/简历切换、双层关系、六种精确状态、归档 Resume、搜索、筛选、筛选空态、刷新、深浅主题；
  940px 下列表/详情切换、返回和无横向滚动通过。
- 真实 200% Electron 缩放以 `webContents.setZoomFactor(2)` 验证，实际得到 640 CSS px、DPR 4；首次
  发现顶部切换器在该宽度被裁切，已将极窄纵向排列断点修正为 700px。复测时切换器、搜索、筛选和
  刷新控件全部处于视口内，`scrollWidth === innerWidth === 640`，侧栏覆盖层及详情返回通过；验收后
  已恢复浅色与 100% 缩放。
- J2 完成；没有 commit/push。下一阶段进入 J3，开始前只确认表格中仍未确认的主操作、重复投递、
  稳定版本锁定入口和跨模块返回行为，不重开已经确认的通用 Resume 与显式纠错规则。

**J3 确认结果（2026-07-29，用户确认）**：

- JD 详情以“生成针对性简历”为主操作，并提供匹配经历、记录投递、查看相关投递；Resume 详情以
  “记录投递”为主操作，并提供查看相关投递。匹配/生成通过新对话携带精确 `jdId` 进入既有
  Agent、Proposal 和审批链路。
- 新投递必须同时选择 JD 与实际 Resume；同一组合只给出已有次数和最近投递事实的软提示，不禁止
  继续记录。首次提交先生成不可变 Proposal，二次确认后才写本地 Outbox。
- Application 新增可空 `resumeContentHashSnapshot`：新记录冻结当前 Resume `contentHash`；历史空值
  显示“历史记录未锁定版本”；普通更新保持快照，只有显式纠正 Resume 关联时刷新标题与指纹。
- Tracker 相关投递按精确 `jdId`/`resumeId` 过滤；往返求职仓库时保留视角、搜索、筛选、选中资产和
  详情状态。关系纠正必须展示旧→新并更新原记录，不复制、不自动取消。

**J3 完成记录（2026-07-29）**：

- App 新增职责分离的 Application Proposal 服务、跨模块导航状态和仓库/Tracker 页面协调模块；
  JD/Resume 可预填投递、精确过滤 Tracker、反向定位资产，匹配/生成会把精确 `jdId` 交给新对话。
- 新投递与关系纠正均采用两步确认；确认后写既有 Application LocalSyncStore/Outbox。重复组合提示按
  `appliedAt`（缺失时回退 `createdAt`）选择最近事实，归档 Resume 可用于纠正历史关系。
- 两仓库契约新增 `resumeContentHashSnapshot`，后端 migration `00009` 已实际升级到 version 9；
  OpenAPI、HTTP、domain、service、repository、sync payload/command 均已接线。普通更新保留指纹，
  只有 Resume ID 显式变化时要求并刷新新指纹。
- 真实 Electron 使用现有登录账号完成：JD→Agent 精确 ID 匹配、JD/Resume 预填投递、软重复提示、
  Proposal 二次确认、Outbox→后端同步、自动打开新记录、Tracker 精确过滤、双向资产定位、完整导航
  状态恢复、旧记录未锁定提示、显式 Resume 改绑及改回。数据库核对确认标题、ID、内容指纹和版本一致；
  验收创建的 Application 已通过 UI 软删除清理。
- Electron 800px 深色与浅色回归通过：窄屏为列表/详情单页，无横向滚动；复用现有 token、组件和
  状态色。验收中修复旧记录缺字段兼容、Vue 导航状态克隆、重复投递最近时间口径、归档 Resume
  选择器四个真实问题。
- 最终自动质检通过：App `npm run check` 全绿，395 个业务/样式文件均不超过 250 行，Node/Renderer
  类型检查、240/240 单测、Node 与 Electron 构建通过；Backend `make check`、`make test`（race）、
  OpenAPI lint 与跨仓库 17 项源文件哈希校验通过。仅保留既有 JD handler 224 行目标提示，仍低于
  250 行硬上限；没有上帝类，没有 commit/push。
- J3 完成；下一阶段按固定顺序进入 E0，只冻结独立经历仓库的体验和领域规则，不提前实现 E1/E2。

**J3 UI 修正记录（2026-07-29，用户确认）**：

- 用户确认将求职仓库从数据看板式详情收敛为轻量资产工作台：减少无意义分割线和补丁式卡片，只保留
  顶部/主从布局的必要边界；左侧列表与详情使用同一底色，宽屏列表缩为 280–340px。
- 删除大号投递概览卡和六种状态计数；岗位/简历详情改为一行关键摘要。正常 `clean/synced/cloud_only`
  不再重复显示，仅保留待同步、冲突、仅本机、本地修改、归档等有决策意义的状态。
- JD 的“针对性简历”和“实际使用的其他简历”合并为“关联简历”，用“针对本岗位 / 实际使用 /
  引用缺失”标签保留真实关系；Resume 的主要目标 JD 与实际投递 JD 同样合并为“关联岗位”。
- 详情顶部只保留两个主要动作；匹配经历和查看全部投递收进更多操作。最近投递只展示三条，
  “查看全部”继续进入精确筛选 Tracker；岗位要求与原始 JD 合并为默认折叠区域。
- Resume 详情移除独立的类型、更新时间和本地检查点区块；类型并入标题副信息，本地检查点继续由
  简历编辑环境负责，不在求职关系页面重复展示。
- 实现前已按用户一次性授权提交回退基线：App `31e32a4`、Backend `7b46202`，均未 push。本轮 UI
  修正没有再次 commit。
- 最终 `npm run check` 全绿：395 个业务/样式文件均不超过 250 行，Node/Renderer 类型检查、
  243/243 单测、Node 与 Electron 构建通过。真实 Electron 验证岗位/简历视角、更多菜单、岗位要求
  展开；1211px 浅色、800px 深色详情和 640px 浅色列表均无横向滚动，窄屏返回和侧栏覆盖层正常。
- 后续细节修正将岗位与简历的更多操作统一替换为与左下角账户入口一致的 Lucide `Ellipsis`
  （17px、1.8 stroke），并复用 28×28 的透明触发区；
  岗位副标题只展示真实公司和不重复的目标岗位，两者均缺失时不再显示“未填写岗位信息”占位。
- Resume 详情新增复用 `Eye` 的“预览简历”次操作；本地资产继续读取当前本地工作稿，云端资产经新增
  最小只读 IPC 读取结构化内容并使用既有 A4 渲染器展示，不创建对话、草稿、Proposal 或任何写入。
  冲突资产不猜测版本，必须先在对话框中明确选择“预览本地版本”或“预览云端版本”。
- JD 关联简历改为可操作关系项：点击真实存在的 Resume 会先进入对应简历详情，缺失引用保持只读；
  从仓库进入预览后可显式返回，并保留原视角、搜索、筛选、选中项和详情状态。
- 本轮自动质检再次通过：`npm run check` 全绿，401 个业务/样式文件均不超过 250 行，243/243 单测、
  Node/Renderer 类型检查与两端构建通过，`git diff --check` 通过。真实 Electron 使用现有两份
  `cloud_only` Resume 验证云端只读 A4、返回状态保留、JD→Resume 详情跳转、两处 18px Lucide 图标，
  1402px 宽屏与等效 876px 窄屏均无横向溢出。当前账号没有本地 Resume 或冲突样本，因此未为验收
  篡改业务资产；本地复用路径和冲突显式选择路径由类型检查与构建覆盖。本轮没有 commit/push。
- 从求职仓库预览 Resume 后，对话输入区现在持续展示当前操作对象。打开本地工作稿时，后续消息继续
  走既有不可变 Proposal 与接受/拒绝链路；打开云端 Resume 时明确标记“云端只读”，Agent 只能通过
  `get_resume` 读取结构化内容并分析，不能静默创建草稿、保存或覆盖云端。切换对话、返回仓库、关闭
  预览或手动移除时会清理该上下文。
- 云端 Resume 的编辑入口改为“创建本地工作副本”，必须经过二次确认。确认后只允许基于云端结构中
  真实关联的 JD 和来源经历重建新本地工作稿；来源不足时继续追问，不伪造 Workspace，也不改写原
  云端 Resume。云端结构化正文在 Agent 持久化前会被清除，恢复会话时必须重新读取当前版本。
- 最终自动质检通过：`npm run check` 全绿，403 个业务/样式文件均不超过 250 行，Node/Renderer
  类型检查、246/246 单测、Node 与 Electron 构建通过，`git diff --check` 通过。真实 Electron
  验证岗位和简历详情均实际渲染 17px 横向 `lucide-ellipsis` 与约 28×28 触发区；云端只读上下文、
  副本确认弹窗、取消零写入、手动清理不关闭预览、切换对话自动清理均通过，1402px 宽屏和等效
  876px 窄屏无横向溢出。当前账号只有两份 `cloud_only` Resume，故没有为测试创建或修改业务数据，
  最终“确认创建”写入未在真实账号执行；本轮没有 commit/push。

### E0–E6：独立经历仓库

> 只补 `cv-agent-app` 的独立入口和维护调用面，不重做已完成的 Go Experience CRUD、同步协议、
> 文件解析、候选审批或 JD 匹配；FactBank、材料库、图片和原始文件上传继续不在范围内。

| 阶段 | 实施内容 | 到阶段再确认的点 | 完成门槛 |
| --- | --- | --- | --- |
| E0 体验与领域规则 | 冻结时间线、查询、日期、归档、删除、pending revision 与下游使用规则；只写规则和测试计划，不写 UI | `present`/空日期/部分精度排序；跨年分组和 tie-break；标签 AND/OR、大小写和正文搜索；归档项是否参与 Agent/JD 匹配/简历生成；pending/conflict Experience 是否允许作为证据 | 所有规则可转为确定性测试；UI 方案和技术限制写清；未确认项不带入 E1 |
| E1 Store / IPC | 补 update、archive/restore、soft-delete、运行时校验、optimistic projection、Proposal/Executor、IPC/Preload、错误分类与同步恢复 API；归档/恢复映射为 `update(status)` | 冲突恢复允许哪些动作；validation failure 与 version conflict 的展示语义；是否保存 `lastServerPayload`；pending 本地 revision ID 的服务端回写/重绑定策略 | 连续离线 `create→update→archive/delete`、重放、墓碑、冲突和失败恢复通过；Renderer 不拼 Outbox mutation |
| E2 时间线页面 | 先提交页面文字方案或线框并等待确认，再接入侧栏入口、搜索、筛选、时间线、详情和同步状态 | 主视图布局、详情承载方式、摘要密度、高亮样式、状态表达、窄窗口降级；任何新增颜色、组件或布局 | 用户确认后才实现；深浅主题、940px、200% 缩放、键盘和 ARIA 通过；不引入第二套主题 |
| E3 维护体验 | 新建和编辑表单、归档/恢复、删除确认、未保存变更保护；正文变化创建不可变 revision，相同 hash 不制造伪版本 | 日期精度控件；表单字段和校验反馈布局；离开未保存表单；归档、恢复和软删除确认文案；冲突后的编辑入口 | 所有写入先冻结 payload、`entityVersion` 和影响范围再审批；失败可恢复；删除不伪装成归档 |
| E4 导入闭环 | 复用现有 ApprovalCard 导入结果中的 `experienceId`，进入经历仓库并定位本次成功写入项；不建设第二套导入 | 部分成功时按钮文案；多条结果的聚焦/高亮；分页外定位；高亮何时清除；返回原对话的方式 | 单条、多条、部分成功和重试均能定位正确资产；不复制导入状态机 |
| E5 版本记录 | 使用现有在线 revision 分页接口按需读取历史；pending 本地正文单独标识；恢复历史正文通过新 Proposal 创建新 revision | 离线时显示“历史不可用”还是保存最后服务端快照；恢复当前/相同 hash 时禁用还是 no-op；历史列表信息密度与恢复确认 | 不复制完整历史到同步 projection；分页稳定；恢复不覆盖历史、不做复杂 diff 编辑器 |
| E6 验收与回归 | 覆盖排序、筛选、日期精度、离线重放、冲突恢复、导入跳转、revision 分页、XSS、IPC 非法输入、跨账号和下游回归 | 后端正式单用户上限 200 条 Experience 的明确性能指标；专用测试账号与资产清理范围；真实 Electron 验收样本 | `npm run check`、行数门禁、真实 Electron + Docker 主路径/失败路径通过；JD 匹配未回归，简历生成沿用已完成阶段的有效实测证据 |

**E0 完成记录（2026-07-29，用户确认）**：

- 本阶段只冻结 Experience 体验、领域规则和测试计划，没有实现 UI、Store 写入或后端变更。
  已核对后端 OpenAPI、Experience Domain/Application/PostgreSQL/SyncAdapter、migration `00003/00008`
  以及 App `ExperienceSyncStore`、Agent 工具、MatchReport 和 Resume source snapshot 链路。
- 日期保留 `YYYY-MM`、`YYYY-MM-DD` 和结束日期 `present` 的原始精度；展示时禁止补日。
  时间线按倒序排列：`present` 最前，明确结束日期其次，结束日期缺失的经历进入“日期待补充”并排在
  明确日期之后。排序时开始月按月初、结束月按月末计算；跨年经历只出现一次，归入结束年份，
  `present` 归入“至今”。同时间依次按结束日期 DESC、开始日期 DESC、`createdAt` DESC、
  稳定 ID 字典序 DESC 收口。
- 关键词搜索覆盖标题、组织、角色、地点、标签和当前 revision 正文，不搜索历史 revision；
  比较值统一执行 Unicode NFKC、去首尾空格和 locale-independent lowercase。多标签采用标准化后的
  完整匹配 AND；类别、状态、标签、关键词之间同样为 AND。默认查询只展示 `active`，
  `archived` 只能通过明确筛选进入。
- 归档是可恢复状态，不是删除。归档经历可查看、编辑和恢复，但在恢复前不进入 Agent 自动发现、
  JD 匹配或 Resume 生成。删除使用软删除墓碑，普通 UI 不提供直接恢复；删除不级联删除 Resume、
  MatchReport、JD 或 Application，既有下游结果继续保留已经冻结的 revision ID、hash 和正文事实，
  但新的查询、匹配和生成不能再使用该经历。
- `pending` 代表用户已确认、等待同步的本地事实，允许参与匹配和 Resume 生成，但必须冻结本地
  revision ID/hash 并展示“待同步”。`conflict` 可查看但在解决前不得成为新证据；
  `failed/validation_failed` 同样不得成为证据。既有冻结结果不因后续 pending/conflict 被静默改写。
- 只有当前正文 hash 真正变化才创建不可变 revision；标题、标签、日期、状态等元数据变化不创建
  revision。pending 本地 revision 必须单独标识，不能冒充服务端历史；完整历史继续通过在线分页接口
  按需读取，不复制进同步 projection。
- 契约审计发现两项必须在 E1 修复的漂移：
  1. 当前后端/App 实际标签筛选为 OR 且不搜索正文，与 Agent 工具声明的标签 AND、正文搜索不一致；
  2. 当前 Direct/Sync Update 使用普通 nullable 字段，无法区分“字段未提交”和“明确清空”，
     只改标题也可能清空组织、角色、地点或日期。E1 必须引入明确 presence 语义并共用同一 Mapper，
     不得在 Renderer、Direct Adapter 和 Sync payload 各自猜测。
- E1 还必须在职责单一的 Experience 领域层建立统一下游资格判断：`active + clean/pending` 可作为
  新证据，`archived/conflict/failed/deleted` 不可作为新证据；Match 与 Resume 共用该规则，
  禁止分别堆叠状态分支。页面继续读取本地 projection；单用户上限 200，当前正文已随 projection
  同步，因此 v1 不增加全文检索服务、GIN 或第二套远端搜索状态。
- E2 仍需在开始阶段后单独确认布局、详情承载、信息密度、状态表达和窄窗口方案；E0 只冻结排序、
  分组、搜索和状态语义，不构成 UI 方案授权。

**E0 确定性测试矩阵**：

| 规则 | 必测样本 | 期望 |
| --- | --- | --- |
| 日期精度 | `2024-03`、`2024-03-18` | 保持原文；排序分别按月边界/实际日期，展示不补日 |
| 结束日期 | `present`、明确日期、`null` | 依次进入“至今”、结束年份、“日期待补充” |
| 跨年 | `2022-01` 到 `2024-06` | 只在 2024 分组出现一次 |
| 稳定排序 | 日期相同、创建时间相同的两条经历 | 使用稳定 ID 收口，刷新、分页和同步后顺序不漂移 |
| 关键词 | 大小写、首尾空格、地点、标签、当前正文 | 标准化后命中；历史 revision 独有文本不命中 |
| 标签 | `["Go","Sync"]` 查询 `["go","sync"]` | AND 且大小写不敏感；缺任一标签即不命中 |
| 状态 | active/archived/deleted 混合 | 默认仅 active；归档需显式筛选；墓碑不进入普通结果 |
| 证据资格 | clean、pending、conflict、failed、archived | 仅 clean/pending 可创建新 Match/Resume source snapshot |
| Revision | 同 hash、正文变更、纯元数据变更 | 仅正文 hash 变化追加 revision |
| 删除引用 | 被 Match/Resume 引用后软删除 | 旧冻结事实可读；新读取/生成拒绝；不级联删除下游资产 |
| Update presence | 只改标题、明确清空地点 | 前者保留其他字段，后者只清空地点 |
| 分页一致性 | 筛选后跨两页、同步页更新 | 无重复、无遗漏；tie-break 与 cursor 规则一致 |

**E1 完成记录（2026-07-29，用户确认）**：

- 本阶段未修改任何页面组件、布局、样式或主题；Renderer 只补充 `DesktopApi` 的 Demo/不可用
  适配占位，真正的经历仓库 UI 仍留在 E2，必须先提交方案并取得用户确认。
- 后端先更新 OpenAPI 与同步设计，再实现完整替换语义：Direct `PUT` 和 Sync update 必须提交
  当前全部字段，遗漏字段在写入前拒绝，显式 `null` 可清空可空字段；只有正文 hash 变化才创建
  revision，内容变化时精确保留客户端提供的稳定 `revisionId`，纯元数据变化不制造 revision。
- 后端 Experience 查询统一为 Unicode NFKC、trim、lowercase 语义；关键词覆盖标题、组织、
  角色、地点、标签和当前 revision 正文，多标签为完整匹配 AND；默认只查 `active`，
  `archived` 必须显式筛选。版本冲突返回最新服务端 projection/tombstone，供 App 恢复。
- 本地同步 schema 将 `failed` 与 `conflict` 分离，并按实体加密保存最后服务端 payload、
  operation 和错误码；迁移保留旧 projection/outbox。`applied` 更新服务端 baseline，
  retryable 保持 pending，version conflict 进入 conflict，validation/forbidden 进入 failed。
- 冲突恢复只开放已确认的三个 Proposal：接受服务端、基于最新服务端版本重新应用本地修改、
  将本地内容另存为新经历；服务端墓碑只允许接受删除或另存为新经历，不提供一键覆盖服务端。
  Proposal 在执行前不可变，并再次核对实体版本和本地版本，Renderer 不拼接 Outbox mutation。
- `ExperienceSyncStore` 已补齐 update、archive/restore、soft-delete、本地全文/标签/状态查询；
  IPC/Preload 暴露搜索、读取、准备 Proposal、读取同步问题和执行 Proposal，并对所有 Renderer
  输入做运行时校验。离线连续 `create→update→delete` 保持顺序和期望版本重基。
- Match 与 Resume 共用单一证据资格判断：仅 `active + clean/pending` 可产生新证据；
  `archived/conflict/failed/deleted` 均拒绝。Match 创建前还会复核当前 Experience 的
  revision ID 和 hash，避免引用已变化的正文。
- App `npm run check` 全绿：250 行门禁、Node/Vue 类型检查、257 个测试、Node build 和
  Electron build 全部通过；未新增超限业务文件或上帝类。后端 `make fmt && make test`、
  `make check` 全绿，OpenAPI lint、vet、build、行数门禁和 Compose 配置均通过。
- 真实 Docker API + PostgreSQL 验收通过：稳定首 revision 创建；正文搜索和标准化标签查询；
  完整 PUT 遗漏字段返回 400 且不写入；显式 `null` 成功清空地点；纯元数据更新保持原
  revision；内容更新采用指定 revision ID；默认 active 查询隐藏归档项、显式 archived 查询
  可发现；最后软删除返回 entityVersion 递增的 tombstone。验收业务资产已软删除，临时登录
  Cookie 已清理，API 容器已恢复为验收前的停止状态。
- 本轮未 commit、未 push。E2 开始前仍需逐项确认时间线布局、详情承载、摘要密度、状态表达、
  响应式降级和无障碍方案；E1 的 Store/IPC 完成不构成 UI 实现授权。

**E2 实施计划（2026-07-29，用户确认）**：

- 在侧栏“新对话”之后新增独立“经历仓库”入口，主导航顺序为
  `新对话 → 经历仓库 → 求职仓库 → 投递追踪`；Experience 继续独立于 JD、Resume 和
  Application，不在求职仓库里建立第二个入口。
- 宽屏使用克制的主从布局：左侧约 38% 为按年份分组的经历时间线，右侧约 62% 为当前经历详情；
  只保留一道有结构意义的纵向分隔，不使用统计卡片、层叠面板或逐条分割线。时间线条目依靠留白、
  选中背景和有时间语义的细线/节点建立层级。
- 时间线普通状态只展示原始精度日期、标题、组织/角色、类别和非 clean 同步状态；不展示技术 ID、
  revision ID、下游 Resume/JD/Application 关系、投递统计或完整正文。只有搜索命中隐藏字段时，
  才补一行匹配上下文。
- 排序和分组严格复用 E0：`present` 归入“至今”，跨年只归入结束年份，结束日期缺失归入
  “日期待补充”；不补全月精度日期；同时间使用结束日期、开始日期、createdAt 和稳定 ID 收口。
- 顶部只保留标题、搜索、一个筛选按钮和刷新图标。筛选 Popover 复用现有主题语义，包含
  active/archived 状态、单类别和多标签 AND；显示已启用条件数量并支持一次清空，不长期平铺
  多个下拉框。
- 详情是连续内容面，只展示标题、组织、角色、地点、日期、类别、标签、当前正文和必要同步说明；
  不在 E2 提前加入 E3 的新建、编辑、归档、删除或冲突恢复按钮，也不提前实现 E5 版本历史。
- `clean` 不显示标签；`pending` 使用中性“待同步”；`conflict/failed` 复用现有危险色；
  `archived` 弱化显示。E2 只解释异常状态，恢复动作留给 E3。
- 搜索期间只用现有选中态/表面 token 高亮可见命中；正文或其他隐藏字段命中时展示单行摘要，
  清空搜索立即移除，不增加新配色。
- 宽度大于 940px 同时显示时间线和详情；不大于 940px 先显示列表，选择后进入详情并提供返回；
  200% 缩放按窄屏降级，极窄窗口将标题、搜索和筛选工具纵向排列，页面禁止横向滚动。
- 时间线条目键盘可聚焦并用 `aria-current` 表示选中；搜索、筛选、返回、刷新均有明确标签。
  组件按 Header、Timeline、Item、Detail、Filter 与状态 composable 拆分，业务/样式文件继续遵守
  220 行目标和 250 行硬门禁。
- 实施后先跑确定性排序/筛选/上下文测试和 `npm run check`，再使用真实 Electron 在宽屏、
  940px 以下和等效 200% 缩放下操作入口、搜索、标签 AND、归档切换、详情返回、空态、键盘和
  横向溢出；只有全部通过才写入 E2 完成记录。

**E2 完成记录（2026-07-29，用户确认）**：

- 已按确认方案在侧栏接入独立“经历仓库”，导航顺序为
  `新对话 → 经历仓库 → 求职仓库 → 投递追踪`。页面继续读取 Experience 本地 projection，
  本阶段没有新增 Direct 写路径，也没有修改后端业务代码。
- 宽屏已实现约 38/62 的时间线与详情主从布局，只保留一道结构分隔；窄于或等于 940px 时切换为
  列表/详情单页并提供返回，极窄宽度工具区纵向排列，侧栏沿用现有覆盖层行为。页面无横向滚动，
  未增加新主题、配色、字体、图标系统、统计卡片或与 Experience 无关的信息。
- 时间线严格复用 E0 的日期精度、分组和稳定排序规则：`present`、结束年份和“日期待补充”分别
  分组，跨年经历只出现一次，月精度不补日。条目只展示必要摘要和非 clean 状态，详情连续展示
  当前内容、事实、标签和同步解释；E3 的新建、编辑、归档、删除、冲突恢复以及 E5 历史入口均未
  提前加入。
- 搜索统一使用 NFKC、trim 和 lowercase 语义，覆盖当前正文等隐藏字段；隐藏字段命中时才显示
  单行上下文，匹配片段通过安全文本节点渲染，不使用 `v-html`。筛选 Popover 支持 active/archived、
  单类别和标签 AND，保留条件计数与清空。真实操作发现切换状态后已选但当前结果集不可见的标签
  会消失，现已修复为始终保留已选标签，避免筛选条件无法撤销。
- 组件按 Header、Filter、Timeline、Item、Detail、HighlightedText 和状态 composable 拆分；
  导航也拆出职责单一组件。`check:source-lines` 验证 437 个业务/样式文件全部不超过 250 行，
  未引入上帝类。
- 新增 5 组确定性测试，覆盖分组与稳定排序、月精度标签、NFKC 搜索与标签 AND、隐藏字段上下文、
  安全文本高亮。最终 `npm run check` 全绿：Node/Vue 类型检查、262/262 单测、Node build 和
  Electron build 全部通过。
- 真实 Electron + Docker 验收通过：宽屏入口/时间线/详情、隐藏正文搜索、高亮、标签 AND、
  active/archived 切换、详情返回、键盘 Enter 与 `aria-current`、940px 以下、等效 200% 缩放、
  极窄工具布局、侧栏覆盖层和横向溢出均通过；深浅主题切换后 token 生效，运行期间无
  console error 或 page error。验收资产已在服务端软删除并经再次同步确认不再显示，主题恢复为
  浅色，API 容器恢复为验收前状态。
- 本轮未 commit、未 push。下一阶段为 E3；开始实现前必须单独确认日期精度控件、表单字段与校验、
  未保存变更保护、归档/恢复/删除确认文案和冲突后的编辑入口。

**E3 实施计划（2026-07-29，用户确认）**：

- 经历仓库顶部新增“新建经历”；普通详情提供“编辑”，归档、恢复和删除收进复用账户菜单规格的
  横向 `Ellipsis` 菜单（17px、1.8 stroke、28×28 触发区）。`conflict/failed` 不开放直接编辑，
  只从同步说明进入“处理同步问题”。
- 新建和编辑在详情区域原位切换为连续表单，不使用大表单弹窗；宽屏继续保留左侧时间线，窄屏使用
  完整表单页。取消后恢复原选中项、搜索与筛选。Proposal 核对、归档、恢复和删除继续复用现有
  主题弹窗，不增加新配色或组件体系。
- 表单字段顺序固定为类别/标题、组织/角色/地点、开始/结束时间、标签、正文。可空字段清空时提交
  明确 `null`。标签支持 Enter 或逗号录入，统一 trim、NFKC 去重，最多 40 个。
- 日期控件必须保存原始精度：开始时间支持未填写、按月、精确到日；结束时间支持未填写、至今、
  指定日期，指定日期再选择按月或精确到日。分别使用原生 `month`/`date`，空结束日期不得解释为
  `present`，月精度不得补日。
- 字段错误紧邻字段显示；提交时显示错误摘要并聚焦首个错误。标题、正文、标签、日期范围和长度
  继续复用 Experience 领域校验，不在 Renderer 复制另一套相互漂移的业务规则。
- 表单变脏后，切换经历/筛选、返回窄屏列表、侧栏导航、取消和关闭 Electron 窗口均须先确认。
  App 内使用现有主题确认框，关闭窗口使用系统确认；未变更表单不打扰用户。
- E1 已有 update/archive/restore/delete 和同步恢复 Proposal，但新建尚无 Proposal。本阶段必须补齐
  `prepareCreate → executeProposal`，所有操作先在主进程冻结 payload、`entityVersion`、本地版本和
  影响范围；普通界面不展示技术 ID。首次保存只进入核对，用户二次确认后才写 Outbox。
- 普通编辑核对实际变化并说明是否创建正文 revision；相同正文 hash 和纯元数据修改不得产生伪
  revision。新建默认 active。归档确认说明恢复前不参与 Agent/JD/Resume 下游；恢复确认说明重新
  参与；软删除说明普通 UI 不可恢复且不级联已有冻结事实，不要求输入标题。
- 同步问题对照本地与服务端关键内容：服务端存在时允许接受服务端、基于最新版本重放本地修改、
  另存为新经历；服务端已删除时只允许接受删除或另存为新经历。另存后选中新经历，接受墓碑后返回
  时间线；E3 不提前加入 E5 版本历史。
- 实施后先跑 Proposal、表单映射、日期精度、变脏保护和同步动作的确定性测试，再运行
  `npm run check`。真实 Electron + Docker 必须覆盖新建、纯元数据编辑、正文编辑、归档/恢复、
  软删除、未保存保护、离线 pending、同步失败/冲突恢复、宽窄屏、深浅主题、键盘/ARIA 和清理；
  全部通过后才写 E3 完成记录。

**E3 完成记录（2026-07-29，用户确认）**：

- 已补齐 `prepareCreate → executeProposal`，新建、编辑、归档、恢复、软删除和三种同步恢复动作
  全部先在 Main 进程冻结不可变 Proposal，再经确认写入 LocalSyncStore/Outbox；Renderer 不生成
  operation ID、expectedVersion 或同步 payload。
- 经历详情已按确认方案接入新建、编辑与横向 `Lucide Ellipsis` 更多菜单。表单在详情区原位展开，
  复用现有主题、按钮、Popover、对话框和 token；日期保留未填写、`YYYY-MM`、`YYYY-MM-DD` 与
  `present` 的原始精度，标签按 trim + NFKC + 大小写不敏感去重，可空字段显式清空。
- 校验错误紧邻字段并提供摘要；表单变脏后，切换经历/筛选、返回列表、侧栏导航、取消和关闭窗口
  都会拦截。真实操作发现 Vue reactive Proxy 不能直接 `structuredClone`，已改为职责明确的显式
  draft clone；筛选改为受控更新，避免未保存确认前先改写状态；删除后先清空选中项，避免残留读取。
- 纯元数据编辑保持原 revision ID，正文变化才创建新 revision；归档/恢复文案明确下游证据资格，
  软删除不伪装为归档。`conflict/failed` 锁定普通编辑，只能进入本地/服务端内容对照，并按服务端
  是否为墓碑限制恢复动作。
- 双 Worker 冲突质检发现后端幂等重放只保存版本和错误码、丢失 `serverEntity`，会把普通版本冲突
  误判成服务端删除。后端已先更新同步设计，再让 `sync_operations.result_metadata` 保存并重放完整
  服务端快照，并补回归测试；首次冲突与同 operation 重放现在保持相同恢复语义。
- App 最终 `npm run check` 全绿：449 个业务/样式文件全部不超过 250 行，Node 与 Vue 类型检查、
  268/268 单测、Node build 和 Electron production build 全部通过。Backend Docker
  `make fmt`、`make test`（`-race`）和 `make check` 全绿；OpenAPI lint、gofmt、vet、build、
  行数门禁和 Compose 配置通过，既有 JD handler 224 行提示仍低于 250 硬上限。
- 真实 Electron + Docker 验收覆盖在线新建、月精度与 `present`、纯元数据/正文 revision、
  未保存导航、归档/恢复/软删除、API 离线 pending、精确到日与空结束日期、窗口关闭拦截、
  重连收敛、深浅主题、940px 以下与 500px 极窄布局、无横向溢出。双 Worker 真实冲突进一步验证
  本地/服务端对照、冲突编辑锁定、重新应用本地修改和同步收敛，运行期间无 console/page error。
- 所有 E3 QA 业务资产均已软删除，临时 Cookie、脚本和截图已清理，API 容器恢复为验收前的停止
  状态。本轮未 commit、未 push。下一阶段为 E4；开始前仍须确认部分成功按钮、多结果定位/高亮、
  分页外定位、高亮清除和返回原对话方式。

**E4 实施计划（2026-07-29，用户确认）**：

- 导入执行继续复用既有 `ExperienceImportProposalStore`、ApprovalManager、Writer 与重试状态机；
  E4 只把执行结果投影为随对话加密保存的只读 artifact，记录来源、成功 Experience ID、失败数和
  跳过的疑似重复数。同一 Proposal 的后续重试更新同一 artifact，禁止复制第二套导入状态机。
- 审批完成后在对话中展示职责单一的轻量结果卡，视觉沿用 ApprovalCard。单条成功按钮为
  “查看已入库经历”，多条成功为“查看 N 条已入库经历”，部分成功为“查看已入库的 N 条经历”；
  全部失败不显示查看按钮，只保留错误说明和既有重试 ApprovalCard。疑似重复仅作为次要说明。
- 点击结果卡后进入经历仓库精确定位模式：按保存的 ID 读取，不依赖当前分页；临时清除会隐藏目标的
  搜索和筛选；单条直接打开详情，多条按原导入顺序选中第一条并提供上一条/下一条。时间线只使用
  现有 surface/border token 轻量高亮，不增加配色、统计卡片或补丁式详情区域。
- 经历仓库顶部仅增加一行紧凑定位上下文，包含“返回导入对话”、本次导入数量与当前位置、上一条、
  下一条和“结束定位”。精确 ID 已归档时仍可进入临时定位；已删除或缺失项只报告数量，不伪造资产。
- 定位高亮不使用自动超时；点击结束定位、选择非本次导入项、修改搜索/筛选或离开经历仓库时清除。
  返回必须恢复原 conversation 并滚动到原结果卡，不创建新对话；部分成功重试更新原卡及定位集合。
- 组件按导入结果契约/持久化、结果卡、导航上下文、定位状态和样式拆分，业务与样式文件继续遵守
  220 行目标、250 行硬门禁。先补单条、多条、部分成功、重复重试、全部失败、分页外 ID、缺失资产
  和返回状态的确定性测试，再运行 `npm run check`。
- 真实 Electron + Docker 必须覆盖完整附件导入、部分成功后查看成功项并重试、精确定位、多条切换、
  返回原对话、重启后结果卡、宽窄屏、深浅主题、键盘/ARIA 与横向溢出；全部通过后才写 E4 完成记录。

**E4 完成记录（2026-07-29，用户确认）**：

- 继续复用既有 Experience Import Proposal、ApprovalManager、Executor、Writer 和失败候选重试链；
  E4 只新增只读结果 artifact。每次 `approval.completed` 会把来源、成功 Experience ID、失败数、
  疑似重复数和完成时间写入同一份加密 Conversation 记录；同一 Proposal 的重试按 `clientId` 合并，
  不复制导入状态机，也不把技术 ID 展示给用户。
- 对话结果卡沿用 ApprovalCard 的视觉与 token，已按确认文案区分单条、多条、部分成功和全部失败。
  全部失败不产生跳转按钮，原有失败候选 ApprovalCard 继续承担重试；疑似重复只显示为次要摘要。
- 经历仓库新增临时精确定位模式：按 artifact 中的 ID 逐条读取并注入当前时间线，因此不受默认分页、
  搜索或筛选影响；多条按原导入顺序提供上一条/下一条并使用既有 border/surface 轻量高亮。归档项
  可临时定位，已删除或缺失项只报告数量。结束定位、选择非目标项、修改筛选或离开页面都会清理。
- “返回导入对话”会恢复原 conversation 并滚动到原结果卡；结果卡随对话持久化，真实 Electron
  重启后仍可再次定位。导航、定位状态、结果展示、持久化与样式均拆为职责单一模块；为保持
  `use-app-shell` 与页面文件低于上限，既有 Resume 指令和经历页面协调逻辑也分别抽到独立 composable，
  未形成上帝类、万能 Store 或第二套业务关系。
- 确定性测试覆盖单条、多条、部分成功、全部失败、疑似重复、失败候选重试、同 Proposal 合并、
  分页外 ID 注入、稳定顺序和循环切换。最终 `npm run check` 全绿：458 个业务/样式文件全部
  不超过 250 行，Node/Vue 类型检查、274/274 单测、Node build 和 Electron production build 通过。
- 真实 Electron + Docker 验收覆盖两条粘贴文本导入、真实 TXT 附件选择与解析、ApprovalCard 审批、
  单/多条结果文案、精确定位、高亮、上一条/下一条、返回来源、Electron 重启恢复、删除引用降级、
  结束定位、筛选清理、深浅主题和 500px 极窄窗口；页面无横向溢出，语义化 button/ARIA 角色可由
  键盘定位，运行期间无 renderer console/page error。部分失败与重试采用可注入失败 Writer 的确定性
  执行器测试验证，未为真实账号篡改 SQLite 或加入生产故障开关。
- 四条 E4 QA Experience 均已通过正式 Proposal 软删除，三个 QA 对话已删除；PostgreSQL 已按精确
  ID 只读确认四条记录的 `deleted_at` 均非空；API 容器恢复为测试前
  停止状态，本轮没有后端业务代码改动、没有 commit、没有 push。下一阶段为 E5；开始前必须单独
  确认版本历史入口、分页交互、pending 本地版本说明和“恢复为新 revision”的 UI 与语义。

**E5 实施计划（2026-07-29，用户确认）**：

- 经历详情正文下方增加默认折叠的“版本记录”，继续使用现有连续详情内容面，不增加独立页面、
  抽屉或复杂 diff 编辑器。展开后按需读取在线 revision，每页 10 条并由用户点击“加载更早版本”；
  每条只显示时间、来源、正文预览和展开操作，不展示技术 ID，也不推导接口未提供的版本号。
- 完整服务端历史不写入 LocalSyncStore、SQLite projection 或其他持久化快照。离线重新打开时明确
  显示“历史记录需要联网查看”，当前正文和本机 pending 正文仍可读；已经加载的页面只在当前组件
  生命周期内保留，后续分页失败不得清空已加载内容，并提供原位重试。
- 只有本地当前正文相对最后服务端 baseline 发生变化，或经历尚未首次同步时，才在历史列表顶部单独
  标记“本机待同步版本”；纯元数据 pending 不制造伪版本。clean 的当前服务端 revision 在在线列表中
  标记为当前版本，conflict/failed 仍可只读查看历史，但恢复前必须先解决同步问题。
- 历史恢复只取目标 revision 正文，保留当前标题、类别、组织、角色、地点、日期、标签和归档状态；
  通过新的不可变 `restore_revision` Proposal 冻结目标、当前 `entityVersion/localVersion` 与影响范围，
  经二次确认后写入既有 LocalSyncStore/Outbox。旧 revision 不覆盖，恢复结果创建新的当前 revision。
- 当前正文或相同 hash 的历史版本禁用恢复，不执行 no-op；clean 与 pending 均允许恢复。pending 上继续
  恢复时，新 Proposal 排在既有本地 revision 后同步，禁止静默丢弃用户已确认的 pending 版本；
  后端既有 source 枚举不扩展，恢复生成的 revision 继续按 `manual` 记录。
- 后端分页接口保持响应 shape 不变，但必须移除 `ListRevisions` 前用 `FindDetail` 全量读取历史的归属
  检查，并采用 `limit + 1` 精确判断 `nextCursor`；不增加 migration。测试覆盖跨页稳定性、正好整页、
  不存在/跨用户资源、pending create/content/metadata、离线、相同 hash、Proposal 漂移及冲突锁定。
- 最终运行 App `npm run check` 与 Backend Docker 门禁，并用真实 Electron + Docker 验证多页历史、
  pending、恢复后新 revision、离线降级、宽窄屏、深浅主题、键盘/ARIA 和无横向溢出；全部通过后
  才写 E5 完成记录，不因接口可见、局部测试或 Browser Demo 提前标记完成。

**E5 完成记录（2026-07-29，用户确认）**：

- 经历详情正文下方已增加默认折叠的内联“版本记录”。在线历史每页固定读取 10 条，用户通过
  “加载更早版本”继续分页；条目只展示时间、来源、三行正文预览、展开与恢复动作，不显示技术 ID、
  不伪造版本号，也没有新增独立页面、抽屉或 diff 编辑器。
- 完整在线历史不进入 LocalSyncStore、SQLite projection 或持久化缓存，只在当前组件生命周期合并。
  首次读取离线时明确提示需要联网，并继续显示当前正文与真正的本机待同步正文；后续分页失败保留
  已加载的记录和游标上下文。纯元数据 pending 不产生伪版本，未首次同步的 create 只显示本机版本。
- 恢复动作只从 Main 进程已读取并缓存的同用户 revision 取得正文，Renderer 只提交 Experience ID 与
  revision ID；新的 `restore_revision` Proposal 冻结当前实体/本地版本和目标正文，经二次确认后复用
  LocalSyncStore/Outbox 写入新 revision。标题、类别、组织、角色、地点、日期、标签和归档状态保持，
  历史不可变，来源沿用 `manual`；当前正文或相同 hash 禁用，conflict/failed 仅可查看。
- 后端 `/revisions` 响应 shape 与数据库均未变化。归属检查改为带 `user_id`、排除墓碑的轻量
  `EXISTS`，不再通过详情读取完整历史；Repository 按 `limit + 1` 读取，DTO 只在确有额外记录时返回
  `nextCursor`。测试覆盖不存在/跨用户归属拒绝、lookahead、正好整页无游标和 App 端稳定跨页合并。
- App 最终 `npm run check` 全绿：464 个业务/样式文件全部不超过 250 行，Node/Vue 类型检查、
  285/285 单测、Node build 和 Electron production build 通过。Backend Docker `make test`
  （含 `-race`）与 `make check` 全绿，OpenAPI lint、gofmt、vet、build、行数和 Compose 门禁通过。
- 真实 Electron + Docker 使用一条专用 Experience 验证 12 条在线 revision 的 10+2 分页、恢复后
  第 13 条新 revision、同正文禁用、字段保持、离线 pending 同步后第 14 条 revision，以及离线分页
  失败保留已加载 10 条。500px 深色界面无横向溢出，折叠/展开使用 button 与 `aria-expanded`，浅色
  主题已恢复，成功验收路径无 renderer page error。QA 驱动最初把异步 Outbox 的短暂 clean 误当作
  同步完成，修正为等待在线 revision 追上本机正文后复验通过，不属于产品故障。
- 唯一 E5 QA Experience 已通过正式 Proposal 软删除，PostgreSQL 按精确 ID 确认 `deleted_at` 非空；
  API 与 Electron 恢复为验收前停止状态，既有 PostgreSQL/Redis/Mailpit 未改动。本轮未 commit、
  未 push。下一阶段为 E6 经历仓库统一验收；开始前须按 E6 完成门槛复核范围和测试资产授权。

**E6 开始前 JD 操作回归修复（2026-07-29，用户确认）**：

- 求职仓库原先把 `jdId` 拼进“匹配经历/生成针对性简历”的用户消息，导致技术 ID 同时出现在消息气泡
  和派生对话标题。现在可见消息只保留岗位标题和用户动作，精确 `jdId`、标题与动作通过职责单一的
  `JdChatReference` 结构化引用传给 Agent；系统提示明确要求只将其用于精确工具读取且不得向用户暴露。
- 既有含 `（jdId: …）` 的加密对话不做破坏性重写；Conversation presentation 仅在展示时识别原产品
  模板并转换为新文案，派生标题同步脱敏。用户自行输入的普通文本不做宽泛 UUID 删除，避免误伤内容。
- App `npm run check` 全绿：465 个业务/样式文件全部不超过 250 行，Node/Vue 类型检查、289/289
  单测、Node build 和 Electron production build 通过。真实 Electron 验证历史对话、匹配入口与生成
  入口均无可见 `jdId`，确认后的两条文案准确显示，运行期无 renderer error；两条 QA 对话已删除。

**E6 完成记录（2026-07-29，用户确认）**：

- 验收容量按后端正式单用户上限调整为 200 条 Experience，而非另造 500 条超规格样本。专用 A 账号
  建立正好 200 条 Experience 并追加 500 次元数据更新；40 轮 Docker API 测量中，列表 p95
  4.92ms、500 changes 后 Pull p95 32.37ms、Bootstrap p95 33.63ms，均低于 200/500/500ms 门槛。
- 实测发现列表正好装满 200 条时仍返回虚假 `nextCursor`。后端改为 `limit + 1` lookahead，并将
  HTTP pagination DTO 投影拆出独立文件；新增测试覆盖正好整页无游标及确有额外记录时才返回游标。
  接口 shape、数据库和同步语义均未改变。
- 真实 Electron 从专用账号恢复 200 条 projection 用时 39ms；经历页 200 项首次可用 92ms；
  40 轮 IPC 列表查询 p95 8.3ms，本地搜索/筛选 p95 26.5ms，分别低于 200/1000/100ms 门槛。
  排序、筛选、日期精度、离线重放、冲突恢复、导入定位、revision 分页、恢复与可访问性沿用
  E0–E5 已记录的真实验收证据，并由本轮全量确定性回归覆盖，没有机械重复已经通过的阶段实测。
- 恶意标题 `<img ... onerror>` 与正文 `<script>...</script><b>...</b>` 在时间线和详情均按纯文本
  呈现，未创建攻击图片/脚本节点且全局标记未执行。Renderer 向 Experience search、create Proposal
  和 history 注入未知字段/非法字段时均由 Main IPC 拒绝，前后条目数保持 200，未产生旁路写入。
- 两个专用账号通过 API 与 Electron 双层验证隔离：列表只包含本账号资产，跨账号 Experience 精确读取、
  revision 读取和更新均返回拒绝/404。岗位匹配真实链路返回 89/100 且未展示 JD、Experience、
  candidate、workspace、item、bullet 等技术 ID；系统提示已把同类内部标识统一限制为仅工具参数。
- 简历生成没有使用本轮同质的单 bullet QA 经历作通过证据：该样本缺少真实的素材差异和选择空间，
  继续生成只会验证硬凑版面。用户指出后已停止运行并删除其全部对话/草稿；E6 不据此宣称生成质量
  通过，简历生成回归继续采用此前阶段中真实、差异化样本已经完成的 Electron/模型验收记录。
- 最终 App `npm run check` 全绿：465 个业务/样式文件全部不超过 250 行，Node/Vue 类型检查、
  289/289 单测、Node build 和 Electron production build 通过。Backend Docker `make test`
  （含 `-race`）与 `make check` 全绿，OpenAPI、gofmt、vet、build、行数和 Compose 门禁通过。
- A/B 专用账号共 210 条 Experience 与 2 个 JD 均通过正式 DELETE 接口软删除并确认普通列表归零；
  6 个 QA 对话和 8 个无效草稿已删除，Electron 恢复为 `dev@example.com`。本轮未 commit、未 push；
  E6 到此完成，S4 尚未开始，其 Tracker 子实体布局与通知语义仍须在阶段开始前另行确认。

### S4：Tracker 业务闭环

**S4 实施计划（2026-07-29，用户确认）**：

- 保留现有“看板 / 时间轴 / 日历”三视图。看板卡片只增加最近面试与提醒的紧凑摘要；时间轴以
  服务端不可变 status event 补齐真实迁移时间并展示面试节点；日历同时展示投递、面试和提醒，点击后
  仍进入同一个 Application 详情，不建立第二套页面或业务关系。
- Application 详情抽屉采用“概览 / 日程 / 记录”三段布局：概览保留现有投递字段；日程维护
  Interview 与 Reminder；记录展示只读状态历史和 Note。Note 正文只在详情中出现，关联面试时标注轮次，
  不进入看板、全局时间轴或日历。窄窗口使用同一详情的满宽布局。
- Interview、Note、Reminder 分别建立自己的 Mapper、Store、Proposal/Adapter、IPC、Vue 状态和组件；
  ApplicationSyncStore 继续只管理 Application。全部业务写入先冻结为不可变 Proposal，经二次确认后
  进入 LocalSyncStore/Outbox；创建 Interview 不暗改 Application 状态，终态只禁止继续迁移，不禁止
  添加复盘 Note、历史面试或 offer 决策提醒。
- 状态历史只读取同步 projection，不在 App 复制或改写服务端事件。尚未同步的本机状态只显示为
  “待同步”，不伪造成历史；clean Application 的最新 event 必须与当前状态一致，没有迁移历史的
  `applied` 记录以真实 appliedAt 作为展示基线。
- Tracker 顶部提供同步问题入口；网络失败保持自动退避并支持立即重试，终态失败/冲突按实体提供
  接受服务端、重新提交本地修改或安全另存。父 Application 删除确认展示子实体数量，本机立即停止
  对应通知，服务端接受后通过既有级联 tombstone 清理 Interview、Note、Reminder；JD、Resume 和
  服务端审计事件不删除。
- Reminder v1 仅支持单次提醒。首次创建启用提醒时请求系统通知权限；编辑按本机时区输入，云端保存
  绝对 UTC 时刻。App 运行时准点执行；关闭期间错过不超过 24 小时的提醒在下次启动补发一次，更早的
  只显示“已错过”。本地送达凭据保证同设备同一 reminder 版本至多一次，云端 delivered 尽量抑制
  跨设备重复；不在 S4 增加托盘、自启动、周期规则或全局 exactly-once 抢占协议。
- 自动测试覆盖严格 payload、投影/墓碑、状态一致性、Proposal 漂移、离线队列、冲突恢复、父删除、
  时区、准点/错过/去重调度。真实 Electron + Docker 使用精确 `S4-QA` 资产验收离线重放、双设备、
  通知权限/去重、三视图、宽窄屏、深浅主题和键盘/ARIA；正式清理测试资产后才标记 S4 完成，不进入 S5。

**S4 Section A 同步领域层完成记录（2026-07-29）**：

- 新增独立的 Interview、Note、Reminder 类型、严格 Mapper 与 Local-first Store；三个 Store 只读取各自
  projection，并分别生成后端严格白名单 payload、乐观锁 Outbox 操作和本地 pending 投影。
  `ApplicationSyncStore` 未加入子实体分支，状态事件由独立 Reader 只读同步 projection。
- 子实体父 Application 与可选 Interview 关联在本机先行校验；重复面试轮次、非法枚举、时间、时区、
  时长和正文长度均 fail-closed。每类写入使用独立 Proposal Service 与实例隔离的不可变 Registry，
  execute 前比较实体版本和更新时间，Proposal 准备后发生漂移会拒绝执行。
- 新增账号隔离的 `reminder_delivery_receipts` 本地表和单一职责送达 Store；提醒调度只读取 active
  Application 下的 scheduled Reminder，排除 conflict/failed，24 小时内补发，过期更久不弹出。
  同一 reminder/remindAt 在本机只记录一次，系统通知送达后再写入 delivered Outbox。
- 当前 Node、Preload、Vue 类型检查和 497 文件行数门禁通过；新增 3 项定向测试覆盖后端 payload key、
  非法投影 enum 与 24 小时提醒边界。此记录只表示 Section A 自动基线通过，不代表 S4 完成；冲突恢复、
  全量门禁和真实 Electron + Docker 尚待后续 section 验收。

**S4 Section B 交互、恢复与联调完成记录（2026-07-30）**：

- 投递详情已接入“概览 / 日程 / 记录”，分别承载既有投递字段、Interview/Reminder 维护以及只读状态历史
  与 Note；看板显示最近面试/提醒，时间轴统计真实 status event 与面试数，日历同时投影投递、面试、提醒。
  500px 深色与 1440px 浅色实测均无 document 横向溢出，最终恢复浅色主题。
- Interview、Note、Reminder 的创建、编辑和删除均使用各自不可变 Proposal 与二次确认；Proposal 执行
  失败后保留重试资格，实体漂移会拒绝旧确认。统一同步问题入口支持接受服务端或基于最新服务端版本
  重新提交；恢复 Proposal 额外冻结完整冲突指纹，问题变化时不会执行旧选择。
- 真实 Electron + Docker 建立一条专用 Application、1 场 Interview、2 条 Note、2 个 Reminder。
  三类创建均验证审批前零写入、确认后 Outbox/clean；状态迁移生成真实 `applied → screening` event，
  看板、时间轴和日历跨视图投影一致。API 停止时新增 Note 立即显示 pending，恢复后“刷新”会等待完整
  Push/Pull 并返回 clean。
- 双临时 Electron 设备制造真实 Note 乐观锁冲突：设备 B 先写入 version 2，设备 A 的离线 version 1
  更新进入 `entity_version_conflict`；统一入口“重新提交本地修改”后以 version 3 成功落云，问题列表归零。
  删除确认准确显示 1 场面试、2 条笔记、2 个提醒；数据库确认父与全部子实体均软删除，关联 JD/Resume
  仍 active。临时设备 profile、脚本和截图已永久删除，API/Electron 恢复为本轮开始前停止状态。
- 实测发现旧 Pull cursor 遇到已软删除 Application 的历史 status event 时，后端 hydration 会遗漏该
  不可变事件并令整页返回 `internal_error`。后端现按 event 自身 `user_id` 维持隔离并允许 hydration
  已删除父记录的历史事件；旧 cursor 已真实追到最新，App 不再丢失后续 status event。
- App `npm run check` 全绿：502 个受控文件均不超过 250 行，306/306 测试、双端类型检查和生产构建
  通过。Backend `make test`（含 `-race`）与 `make check` 全绿，OpenAPI、gofmt、vet、build、行数和
  Compose 门禁通过。

**S4 补充完成记录：全局中英文界面切换（2026-07-31）**：

- 侧栏账户展开栏移除未启用的设置入口，新增单击切换中文/英文的语言入口；默认中文，选择写入
  `coolto-locale` 本地存储，并同步更新文档语言。主窗口与独立浏览器窗口共用同一语言状态，重新启动
  后继续使用上次选择。
- 新增 Renderer locale 核心、分域英文词典、Vue 全局 `$t`/`$tf`/`$locale` 注入；登录、聊天、审批、
  简历、JD、经历仓库、求职仓库、Tracker 三视图与子实体、同步恢复、浏览器壳等 App 自有界面文案、
  日期和动态计数均接入切换。用户输入、JD/Resume/Experience 正文及 Agent 返回内容保持原文，不进行
  不可逆机器翻译。
- 新增 locale 定向测试，覆盖静态文案、插值、日期范围与动态标签随当前语言解析。翻译键静态审计无
  缺失；最终 `npm run check` 全绿：509 个受控文件均不超过 250 行，308/308 测试、Node/Vue 类型检查、
  Node build 与 Electron production build 通过。本补充不改变 S4 阶段状态，下面的真实 macOS 通知
  遗留仍未完成。

**S4 macOS 系统通知验收完成（2026-07-31）**：

- 原因分析：未打包 Electron 在 macOS 上缺少合法应用身份（Bundle ID + 代码签名），系统以
  `UNErrorDomain 1` 拒绝通知展示。`Notification.isSupported()` 返回 `true` 但实际显示被拒。
- 解决方案：引入 `electron-builder`（devDependency），新增 `electron-builder.yml` 配置
  `appId: com.coolto.app`，新增 `npm run package:mac` 脚本执行 `electron-vite build` →
  `electron-builder --mac --dir` → `codesign --force --deep --sign -`（ad-hoc 签名）。
- 验收结果（真实 Electron + Docker 后端）：
  1. **启动补发**：前次运行创建的 `scheduled` 提醒在签名应用重启后被调度器自动送达，状态正确
     变为 `delivered`，`deliveredAt` 写入且 `syncStatus: clean`。
  2. **实时调度**：新建提醒 `remindAt` 到期后 12 秒内由 15 秒扫描周期捕获并展示系统通知，
     `show` 事件触发后写入送达凭据和 Outbox。
  3. **去重**：后续扫描周期不再为已送达提醒创建新通知，`deliveredAt` 时间戳不变。
  4. **macOS 系统通知**：macOS 弹出 Coolto 通知权限确认，确认 `com.coolto.app` 身份被系统识别。
- 测试数据在验收后已删除。`npm run check` 全绿：509 个受控文件均不超过 250 行，308/308 测试、
  双端类型检查和生产构建通过。`.gitignore` 已添加 `dist-electron/`。
- S4 阶段完成；其原完成记录当时将指针推进至 S5。2026-08-02 根据本轮用户要求在 S5 前插入
  S4.5，当前实际指针以根状态和统一执行 Roadmap 为准。

**实施内容**：保持 `ApplicationSyncStore` 只负责 Application；Interview、Note、Reminder 分别使用
自己的类型、Mapper、Store、Adapter、IPC、Vue 状态和组件；状态历史只读服务端 event；Reminder 云端
只同步数据，由本机负责系统通知调度和执行；父 Application 删除传播子实体墓碑。

**阶段开始前确认**：Interview、Note、Reminder 在看板、时间轴、日历和详情中的具体入口与布局；
通知权限请求时机、时区、重复提醒和错过提醒行为；Note 的展示范围；父实体删除时的用户提示。

**完成门槛**：终态不可继续迁移；状态事件与当前状态一致；提醒跨设备同步且只由本机执行一次；
失败可重试；子实体无上帝 Store；真实 Electron + Docker 验收通过。

### S4.5：简历资料、内容、性能与直接导出闭环

> 状态：产品、数据与 UI 方案已于 2026-08-02 获用户确认；App 前置 API 基址已切到本地 Docker
> `http://127.0.0.1:8080`。Section A 尚未开始，后续由八个独立对话严格按 A → H 顺序实施；
> 本阶段完成并质检写回后才能恢复 S5。

**问题与现状审计（2026-08-02）**：

- 附件入口目前只从 PDF/DOCX/文本提取整段文字，后续导入提案只生成 Experience candidates；没有
  个人资料候选、字段级预览、覆盖冲突或 Profile 写入链路。现有 Profile API 在 App 中只有读取能力，
  简历 source snapshot 又使用登录邮箱作为联系邮箱，因此姓名、电话为空时模板只能显示登录邮箱。
- Experience category 当前固定为 `work/project/education/volunteer/other`，而简历候选骨架进一步只接受
  `education/work/project`；技能仅从已选经历 tags 临时聚合，tags 为空时整个技能区消失，论文、奖项、
  证书、研究等内容没有可追溯的 section contract。
- 同一 DOM renderer 同时服务右侧实时预览和隐藏 Chromium 编译。它把 `title + organization` 放在
  第一行、`role + location` 放在第二行，造成教育经历的学位与学校同排。修复必须只对 education 使用
  “学位/专业 + 日期；学校/学院 + 地点”的字段映射，工作和项目节点结构、样式与内容保持现状。
- 生成路径虽然已有完整 source snapshot、EvidenceLedger、Chromium 版面编译和 quality review，
  但缺少生产阶段耗时遥测；Agent 可进行多轮小粒度写入，每次成功 patch 都触发完整编译，备选修复也
  串行编译。不得靠跳过证据、版面编译或质量审查来缩短用户感知的约十分钟耗时。
- 预览右上角已有导出按钮，但当前点击行为只是向聊天发送“请导出 PDF”的新指令；Main 已有系统保存
  对话框、隐藏 Chromium、postflight 和原子写文件能力，却没有“导出当前预览草稿”的专用 IPC。

**本阶段不可破坏的基线**：

- 右侧实时简历预览、左侧 LLM 实时编写过程、消息/工具事件、审批状态、按钮位置与现有主题均保持；
  不增加中间页，不把实时过程替换为静态进度条，不因性能优化减少用户当前可见反馈。
- 工作经历与项目经历保持现有渲染和内容选择行为；教育布局只做 category-aware 字段映射。新增附加
  内容只排在核心经历之后，技能为最后一个业务 section；不得为填满页面编造事实或绕过证据门槛。
- 一页、占用率、尾部位置、字体、溢出、must-have 覆盖、证据绑定与 quality review 等既有门槛全部
  保留。任何缓存、并发或批处理必须产出与原链路相同的确定性结构和编译结论，失败时 fail-closed。
- Profile、Experience、Resume 等持久化业务写入继续经过不可变 Proposal、宿主审批、
  LocalSyncStore/Outbox 和乐观锁；不得为了导入方便恢复 Direct 写入或静默覆盖已存资料。
- 新业务 TypeScript、Vue 和 CSS 文件以 220 行为目标、250 行硬上限；Profile、导入、生成、编译、
  导出各自使用职责单一的类型、Mapper、Store/Service、IPC 与组件，不建立 Resume/Profile 万能 Manager。

#### S4.5 Section A：契约、计时口径与遥测冻结

- 冻结 Profile 联系字段、登录身份与简历联系邮箱的关系；姓名、电话、简历联系邮箱为必填，缺少任一
  字段时不得进入简历生成，其余已确认字段选填。冻结“核心 category + 自定义简历 section”
  的扩展模型、排序、空值与去重规则，以及导入提案对既有资料的覆盖/合并语义。自定义 section 初次
  导入按源材料中首次出现顺序排列；用户后续可调整自定义 section 的完整排序，聊天指令与预览拖拽
  必须共用同一排序事实源。教育、工作、项目和技能的核心位置不允许借此改写。
- 记录本机开发环境、模型、本地 Docker API 与启动口径。为 source snapshot、模型轮次、tool、patch、
  Chromium compile、quality review、保存建立统一 trace，不记录原始隐私正文；不建立合成样本、优化前
  基线或模拟运行作为本 Section 的验收要求。
- **生成耗时唯一口径（用户确认，2026-08-03）**：从用户下发生成简历命令开始，到同一条生成链路的
  source snapshot、模型轮次、tool、patch、Chromium compile、证据校验、quality review、必要修复、合格
  草稿持久化与当前合格预览均完成并交付给用户为止。任何真实发生的等待、失败重试或上述步骤都不得从
  总耗时中剔除；只有达到既有全部质量门槛的 `ready_for_approval` 版本才可作为终点。Section A 不要求
  为优化前版本保留至少三次 trace，也不把优化前耗时作为产品目标。

**完成门槛**：用户确认全部字段与语义；遥测测试证明不泄露姓名、电话、邮箱和正文；统一 trace 可复现并
写回本节。Section A 只建立契约与观测，不改 UI，也不执行性能模拟。

#### S4.5 Section B：个人资料解析、审批与同步

- 附件解析结果扩展为组合导入提案：个人资料 patch 与 Experience candidates 同屏审阅但可分别选择、
  编辑和拒绝；姓名、电话、简历联系邮箱为必填，所在地、LinkedIn、GitHub、个人网站为选填。缺失字段
  保持空值，低置信度明确标注，绝不从文件名或登录账号猜测姓名。
- 登录邮箱继续用于认证和账号隔离；若用户确认采用独立联系邮箱，则新增 `contactEmail`，不再用修改
  简历联系信息暗改登录身份。已有 Profile 与新解析值冲突时逐字段展示，不默认覆盖。
- 建立 Profile 的严格 payload、Normalizer、Local-first Store/Outbox、Proposal、乐观锁、冲突恢复、
  跨账号隔离和 Resume source snapshot 投影；导入确认与手工修改走同一条写入链。

**完成门槛**：PDF/DOCX/文本 fixture 覆盖完整、缺失、低置信度和冲突资料；审批前零写入；离线修改、
重启重放、陈旧版本冲突和跨账号隔离通过；生成只使用当前已确认资料。

#### S4.5 Section C：可扩展经历与技能事实模型

- 保留已有 Experience 核心 category 以兼容 Store、筛选和后端查询；新增可选、规范化的简历 section
  key/label 表达“论文、获奖、证书、研究、社团、技能”等开放类型。未知合法 label 可以保存和渲染，
  不要求每出现一种内容就修改前后端枚举或堆叠分支。
- 导入器输出核心 category、section label、时间、组织/角色、正文与 evidence span；技能采用显式、
  可追溯的技能资产/section，并可与 Experience tags 去重合并，不允许只凭 JD 关键词生成用户未提供技能。
- 候选骨架与 renderer 使用声明式 section registry/order；固定顺序为教育、工作/实习、项目、其他已选
  section、技能。自定义 section 初次导入按源材料首次出现顺序，用户可通过聊天或预览拖拽调整，两个
  入口共用同一持久化排序；其他 section 只有在核心内容后且存在剩余空间时参与填充，删除优先级与截断
  规则必须确定且有测试；内容不足时允许留白，禁止为了占用率伪造事实。
- 所有进入简历的附加条目和技能必须绑定 source snapshot 中的事实证据；不得利用当前 `raw_text`
  无 bullet evidence 校验的空隙绕过 EvidenceLedger 和 quality review。

**完成门槛**：新增未知 section 无需修改 central switch 即可端到端导入、选择、生成和恢复；既有五类
Experience 往返兼容；论文、奖项、证书、技能 fixture 的证据、排序、去重和空间降级测试通过。

#### S4.5 Section D：个人信息 UI 方案确认与实现

- 方案：在左下角现有账户“更多”展开栏中，于“主题 / 语言”和“退出登录”之间增加“个人信息”item；
  点击后打开复用当前主题 token、表单控件和弹窗规范的模态框。弹窗只展示已确认字段，支持查看、编辑、
  取消和保存；保存先生成变更确认，pending/conflict/failed 状态及字段校验在弹窗内可见。
- 宽屏使用居中弹窗；窄窗口使用同一内容的近全屏/满宽布局；焦点进入/返回、Esc、键盘顺序、错误关联、
  中英文、深浅主题和 200% 缩放必须完整。除新增这个 item 和弹窗外，不调整侧栏、聊天或生成工作区布局。

**完成门槛**：用户先确认 item 位置、字段、按钮、校验、同步状态和响应式方案；确认方案写回后才能写
Vue/CSS。实现后完成视觉截图、键盘/ARIA、主题/语言、窄宽屏和离线/冲突实测。

#### S4.5 Section E：模板字段映射与内容回归

- 简历顶部必须展示姓名、电话和简历联系邮箱；生成入口在三项任一缺失时明确阻止并引导补充。所在地、
  LinkedIn、GitHub、个人网站仅在有已确认值时展示，不渲染空占位，不回退为未经确认的猜测。
  教育条目固定为第一行“学位/专业（左）—日期（右）”，第二行“学校/学院（左）—地点（右）”。
- 预览和隐藏 Chromium 必须继续调用同一 renderer；只增加 section-specific presenter/field mapping，
  不复制第二套 HTML 模板。工作/实习和项目使用现有路径，新增 section 复用既有排版 token。
- 使用用户提供的两张截图作为问题证据，并建立结构快照、A4 截图和 PDF 页面渲染对比；视觉差异审查
  必须证明工作/项目区域除被新增内容自然推移外没有字体、间距、粗细、折行规则或信息层级变化。

**完成门槛**：个人资料和教育映射正确；技能位于最后；附加 section 顺序稳定；中英文、缺失字段、
极长值、一页边界均通过同源预览/PDF 回归，既有工作/项目视觉基线无非预期变化。

#### S4.5 Section F：三分钟生成性能闭环

- 优先减少物理模型往返：首轮用 `initialBindings` 生成完整有序草稿，后续用有上限的批量 patch 修复，
  不再按单条经历/单个 bullet 逐轮编写；为每个选中 source item 提供紧凑且均衡的证据摘要，减少反复
  `availableEvidence` 翻页，同时保持原始 EvidenceLedger 引用和 must-have 覆盖。
- 将布局合格后的确定性 quality review 由宿主自动串接，减少“请求下一工具”的空转模型轮次；左侧仍
  展示同样的实时 LLM 文本与工具过程，右侧仍在每个被接受的批次后刷新。不得合并或隐藏用户当前可见阶段。
- App 登录/空闲时预热隐藏 renderer 与字体；仅对完全相同的 structure、Profile、字体和 Chromium
  版本复用 compile 结果。若数据证明备选修复的 Chromium 编译是主要瓶颈，再实现上限为 2 的隔离
  BrowserWindow 池，并用串行/并行结果一致性测试证明无竞态、跨账号或字体差异。
- 性能硬门槛：每次真实用户生成命令都必须在 `≤ 180s` 内按 Section A 的完整端到端口径交付合格预览。
  不建立合成样本、优化前基线、p95/median 或模型调用次数的独立验收指标；失败重试仍须计入，不得剔除。

**完成门槛**：获授权的真实用户生成命令均在 `≤ 180s` 内完成；一页/占用率/尾部、字体、证据、
must-have 和 quality review 结果不得下降；前端 DOM 结构、可见流程和交互截图无改变。

#### S4.5 Section G：当前预览直接导出

- 保留预览右上角现有导出按钮及视觉样式；点击后直接调用专用 `resume-drafts:export-pdf` IPC，传递当前
  artifact ID 与 expected revision。Main 必须重新读取同一草稿，拒绝陈旧 revision、pending change、
  未达到 `ready_for_approval` 或编译/质量门槛不合格的版本。
- 复用现有系统保存对话框、同源 Chromium compile、postflight 和原子写文件；取消不报错，失败提供
  可重试错误。此操作不创建聊天消息、不调用 LLM、不生成 ApprovalCard，也不导出比当前预览更新或
  更旧的隐式版本。

**完成门槛**：真实 Electron 点击一次即可保存并打开当前预览 PDF；文件内容 hash/revision 与预览一致，
取消、同名文件、无权限、磁盘失败、陈旧版本和未合格版本均安全；聊天事件和模型调用数保持不变。

#### S4.5 Section H：统一质检与写回

- 自动门禁：`npm run check`、`npm run check:source-lines`、resume template/renderer 专项回归、
  `git diff --check`；后端契约若有修改则同时执行其完整测试、格式、OpenAPI 和行数门禁。
- 真实验收：Electron + Docker、PDF/DOCX/文本导入、个人资料手改、离线/重启/冲突/跨账号、三类附加
  section、技能、教育排版、预览/PDF 同源、直接导出，以及真实用户命令的完整生成耗时；覆盖中英文、深浅主题、宽窄屏、
  200% 缩放、键盘与 ARIA。测试资产须事先获授权并在结束后精确清理。
- 每个 Section 只有在实现、专项质检和证据写回本 README 后才能标记完成；任何门槛失败都记录失败、
  根因和遗留项。Section A–H 全部通过前，S4.5 和 S5 均不得宣称完成。

**开始实施前必须由用户确认的产品与 UI 事项**：

1. Profile 字段是否采用：姓名、电话、简历联系邮箱、所在地、LinkedIn、GitHub、个人网站；登录邮箱
   只负责账号身份，简历联系邮箱可独立修改。是否还在本弹窗加入当前职位/公司等职业偏好字段。
2. 导入检测到个人资料时，是否采用“逐字段勾选并显示旧值/新值，默认不覆盖已有非空值”的合并方式。
3. 开放类型是否采用“后端兼容的核心 category + 自定义 section key/label”（推荐），而不是把所有
   category 改成任意字符串；其他 section 的默认顺序和用户调整入口。
4. 技能没有任何事实来源时，是省略技能 section（推荐），还是阻止简历完成并要求用户先补充技能。
5. “个人信息”item、弹窗字段与上述宽/窄屏交互是否按 Section D 方案执行。
6. “自动导出”是否保留系统“另存为”对话框（推荐，可选择目录与文件名），还是无提示写入 Downloads；
   是否确认按钮只导出当前已达到 `ready_for_approval` 的合格 revision，生成中的中间预览不允许导出。
7. 三分钟门槛采用的完整端到端口径、测试设备和本地 Docker 条件；是否允许建立并清理专用测试账号/资产。

**S4.5 用户确认结果（2026-08-02）**：

- 个人资料中姓名、电话、简历联系邮箱为必填；所在地、LinkedIn、GitHub、个人网站为选填。本阶段不把
  当前职位、公司或其他职业偏好加入“个人信息”弹窗。登录邮箱只负责认证和账号隔离，简历联系邮箱
  独立保存、修改和展示；三项必填资料未齐时阻止开始生成并引导用户补全。
- 附件导入采用逐字段勾选并展示旧值/新值的组合提案；已有非空资料默认不覆盖，必须由用户显式选择。
- 开放经历采用“兼容现有后端的核心 category + 自定义 section key/label”；自定义 section 初次导入
  采用源材料中的首次出现顺序，用户可通过聊天和预览拖拽调整同一持久化排序；核心教育、工作、项目和
  技能位置固定。技能没有事实来源时省略，不编造也不阻止生成。
- “个人信息”item 位于左下角更多菜单的主题/语言与退出登录之间；宽屏使用居中弹窗，窄屏使用近全屏
  布局，其余侧栏、聊天与生成界面不变。
- 直接导出保留系统“另存为”对话框，只导出当前达到 `ready_for_approval` 的合格 revision；生成中的
  中间预览不可导出，点击不创建聊天消息、不调用 LLM。
- 性能目标只以每次真实用户命令从下发到合格预览交付的完整耗时 `≤ 180s` 判定；不要求合成样本、
  优化前基线或性能模拟。测试账号和测试资产只能精确创建、记录并在验收后清理，不得操作用户已有业务数据。
- 开始 S4.5 前将 App API 环境覆盖从线上服务器切换为本地 Docker `http://127.0.0.1:8080`；代码默认值
  与 `.env.example` 原本已是该地址，本次只修改被 `.gitignore` 排除的本机 `.env` 覆盖项。API 基址
  参与会话和本地 projection 隔离，切换后重新登录并建立独立本地状态属于预期行为。
- 前置切换专项验证：`npm run typecheck` 与 `test/config.test.ts` 2/2 通过；2026-08-03 已启动本地 Docker，
  `http://127.0.0.1:8080/health/live` 与 `/health/ready` 均返回成功。本记录仅证明本机 API 可用；各 Section
  进入真实联调前仍须先复核 Docker 健康状态，且禁止自动回退线上服务器。

**S4.5 Section A 完成记录（2026-08-03）**：

- **确认契约**：姓名、电话、独立简历联系邮箱为生成前必填；电话只保留用户输入展示格式，比较时才派生
  规范值；LinkedIn、GitHub 和个人网站只能接受完整 `https://` URL。登录邮箱继续只负责认证。导入提案只
  提供非空解析值；已有非空字段默认不覆盖，只有用户选择的提案字段才合并，空解析值不会清空资料。
- **开放内容与排序**：核心 category 与自定义 section key/label 已拆为独立契约；核心顺序为教育、工作、
  项目、自定义 section、技能，技能无事实来源即省略。自定义 section 的初始顺序按来源中首次出现位置，
  并由一份完整有序 key 列表作为未来聊天指令和预览拖拽的共同事实源；本 Section 没有实现这两个用户入口，
  也没有改变现有 renderer。
- **计时与隐私**：`ResumeGenerationTraceStore` 使用单调时钟记录命令开始至结束，实际接收 Pi 模型开始/结束、
  source snapshot/tool/patch/quality review、Chromium compile、草稿保存及 `ready_for_approval` 预览交付事件；
  每次 trace 只保存 ID、模型标识、阶段、时长、状态和结果，运行时可按会话读取脱敏报告。模型提示、工具参数、
  姓名、电话、邮箱、简历正文与证据原文均不进入 trace；该 trace 不作持久化，以免形成新的隐私副本。
- **验证证据**：`test/resume-performance.test.ts` 覆盖联系方式、URL、开放 section、导入合并、同一排序契约、
  实际 Pi 生命周期映射及敏感值排除；`npm run check` 通过（322 tests、518 个受控业务源文件均 ≤250 行、
  Node/Renderer 类型检查与两端构建通过），`git diff --check` 通过。本机 Docker API 已以宿主环境
  `GET /health/live` 和 `GET /health/ready` 复核成功，基址固定为 `http://127.0.0.1:8080`。
- **范围边界**：本记录不宣称完成个人资料持久化/UI、开放经历端到端、模板改版、性能优化或直接导出；没有
  运行合成样本、性能模拟或三分钟验收。每次真实用户命令的完整耗时 `≤180s` 仍是 Section F 的硬门槛。
- **复核（2026-08-03，进入 Section B 前）**：以当前工作树重新执行 `npm run typecheck` 与 `npm run test`，
  两者通过（322/322 tests）；`test/resume-performance.test.ts` 的联系方式、导入合并、共享排序与脱敏 trace
  覆盖均通过，`git diff --check` 通过。复核只确认 Section A 的本地契约与观测实现，不替代 Section B 所需的
  Profile 后端写入/同步契约或真实 Docker 联调。

**S4.5 Section B 完成记录（2026-08-03）**：

- **组合解析与审批**：附件 parser 保持 PDF/DOCX/文本的显式选择和本地正文提取；`prepare_experience_import`
  现在以独立 schema/normalizer 把正文解析出的 Profile patch 和 Experience candidates 冻结进同一 proposal。
  卡片逐字段显示旧值→新值、可分别勾选资料和经历；已有非空资料默认不选，低置信度明确标识。文件名、来源说明
  与登录邮箱均不进入姓名推断路径；解析缺失值不会变成清空操作。
- **Profile 严格写入链**：新增独立的 `contactEmail`（登录邮箱继续只作认证/隔离），Profile 手工 IPC 和附件
  导入都通过不可变 Profile proposal、账号所有者范围内的 `user_profile` LocalSyncStore/Outbox、乐观版本、
  `accept server` 与显式 reapply 冲突恢复；没有 Profile Direct API 写路径。导入审批 payload 只持有 proposal ID，
  执行时重新以冻结 proposal 校验可选字段/候选 ID，避免 payload 篡改或静默覆盖。
- **生成前置条件**：Resume source snapshot 只投影已由本地同步链确认的 Profile 联系字段，不再把登录邮箱回退为
  简历邮箱；姓名、电话或简历联系邮箱缺失时以 `missing_required_profile_fields` 明确、可测试地阻止生成。
- **后端契约与迁移**：后端新增 `user_profiles.contact_email` migration，REST Profile、sync command/projector、
  OpenAPI 与校验同时支持该字段；邮箱、https URL 和乐观版本保持 fail-closed。迁移已应用至本机 Docker，
  `GET /v1/users/me/profile` 及 `/v1/sync/bootstrap` 均确认 `contactEmail` 出现在完整 projection。
- **验证证据**：App `npm run check` 通过（329 tests、526 个业务源文件均 ≤250 行、Node/Renderer/Electron 构建通过）；
  专项回归覆盖 PDF、DOCX、文本，完整/缺失/低置信度/字段冲突资料，审批前零写入、离线 Outbox、重启重放、
  陈旧版本冲突、跨账号隔离和 source snapshot 前置校验。后端 `make fmt && make contract-lint && make check && make test`
  与两边 `git diff --check` 均通过（后端仅报告既有 224/222 行目标提示）。真实 Electron 已启动并保持主进程、
  网络/GPU/renderer；只使用 `http://127.0.0.1:8080` 的本地 Docker 登录、Profile 和 bootstrap 验收，未修改既有开发账号资料。
- **范围边界**：本节未开始 Section C–H；左下角“个人信息”弹窗属于已确认但尚未实施的 Section D，当前手工修改
  通过受限 IPC/Proposal 链提供，不能绕过同步约束。

### S5：全产品联调与性能验收

**实施内容**：对 P1–P4、J0–J3、E0–E6 和 S3–S4.5 统一执行真实账号主路径、失败恢复、双设备冲突、
断网/重启/重放、Bootstrap/Pull 分页、Direct 写路径清理、安全与性能验收；P2/P3/P5 过去未关闭的
真实 Electron/模型验收统一在本阶段收口。

**阶段开始前确认**：S4.5 已确认的真实用户命令完整耗时硬指标、测试设备条件；专用测试账号；
是否允许创建、归档或软删除哪些精确测试资产；跨端 Web 验收范围。未经确认不清理或破坏用户业务数据。

**完成门槛**：`npm run check`、行数门禁和真实 Electron + Docker 全绿；至少 500 条同步分页、求职仓库、
经历时间线和 Tracker 达到确认指标；无重复创建、静默覆盖、跨账号泄漏、证据漂移或绕过 Outbox 的写入。

**S5 Section A：Direct 写路径审计与安全验收完成记录（2026-07-31）**：

- **Direct 写路径审计通过**：Desktop App（Electron）的全部业务写入均经过 LocalSyncStore/Outbox，
  没有发现绕过 Outbox 直接调用后端 API 的遗留写路径。CLI 入口设计上直连后端（无 SQLite/同步基础设施），
  不属于"迁移后不再使用的遗留路径"，API 层保留的写方法由 CLI 消费，不清理。
  审计覆盖 Experience、JD、Resume、Application、Interview、Note、Reminder 全部实体类型。
- **XSS 渲染审计通过**：代码审计覆盖全部 Vue 模板中 JD（25 处）、Application（22 处）、
  Interview（5 处）、Note（1 处）、Reminder（3 处）的文本渲染，全部使用 `{{ }}` 安全插值，
  零个 `v-html` 用于用户业务内容。唯一的 `v-html` 在 `MarkdownContent.vue`（LLM 回复），
  双重消毒（MarkdownIt `html:false` + DOMPurify）。Resume 渲染器的 innerHTML 有白名单标签过滤。
  渲染机制与 E6 中 Experience 的 XSS 实测使用同一 Vue `{{ }}` 框架保证。
- **IPC 输入校验缺口修复**：审计发现 Application IPC 完全没有运行时校验（TypeScript 类型在运行时擦除，
  renderer 传入任意字段直通 Store），Interview/Note/Reminder 有字段白名单但缺少类型检查和枚举校验。
  - Application：新增 `application-ipc-validation.ts`（182 行），补齐字段白名单、类型检查、枚举校验，
    涵盖 create/update/transition/list/get/delete 全部 IPC channel。
  - Interview：补齐 `roundNumber` 正整数、`interviewType` 七值枚举、`status` 三值枚举、
    `durationMinutes` 1–1440 范围校验。
  - Note：补齐 `noteType` 四值枚举、`content` 非空字符串校验。
  - Reminder：补齐 `status` 四值枚举、`title`/`remindAt` 非空字符串校验。
  - `tracker-ipc-validation.ts` 的 `childRequest` 去除不安全的泛型 `as T` 强转，改为先白名单后逐字段
    类型校验的两步验证。
- **修复后校验覆盖**：

  | 实体 | 修复前 | 修复后 |
  | --- | --- | --- |
  | Experience | 完整（白名单+类型+枚举） | 未改动 |
  | Application | 无校验 | 完整（白名单+类型+枚举） |
  | Interview | 部分（仅白名单） | 完整（白名单+类型+枚举） |
  | Note | 部分（仅白名单） | 完整（白名单+类型+枚举） |
  | Reminder | 部分（仅白名单） | 完整（白名单+类型+枚举） |

- **自动质检通过**：新增 9 个 IPC 校验测试（Application 5 个、Interview/Note/Reminder 各 1 个扩展），
  覆盖合法字段接受、未知字段拒绝、类型错误拒绝、非法枚举拒绝和边界值。最终 `npm run check` 全绿：
  510 个受控文件均不超过 250 行，317/317 测试、Node/Vue 类型检查、Node build 与 Electron production
  build 通过。
- **待完成**：端到端集成闭环验证（全链路跳转与数据一致性）和求职仓库/Tracker 性能基准需要真实
  Electron + Docker 操作；这些剩余工作暂停至 S4.5 完成，不以 Section A 完成提前宣称 S5 完成。

### R1：生产上线准备

**实施内容**：Mailpit 切换正式邮件供应商；Redis 分布式限流；域名/HTTPS；PostgreSQL 备份恢复；
日志、指标、告警；生产密钥；Docker 发布和回滚。首发继续采用 Docker 单体 API + PostgreSQL + Redis，
不因尚未出现的流量提前拆微服务。

**阶段开始前确认**：邮件供应商、云厂商和地域、域名、备份 RPO/RTO、告警渠道、发布窗口、回滚标准及
生产数据操作授权。支付、定价和支付 Provider 不在本 Roadmap，需另行确认和设计。

**完成门槛**：staging 真实邮箱闭环；跨实例限流；备份恢复与发布回滚演练；生产密钥不进入仓库；
运维文档、故障责任边界和验收证据齐全。

## 实施约束

- 当前严格按 A0 → J0 → J1 → J2 → J3 → E0 → E1 → E2 → E3 → E4 → E5 → E6 → S4 → S4.5 → S5 → R1 推进；
- 每阶段先复核现状和工作树；列出的确认点必须在该阶段开始时向用户确认，不提前假设；
- 每阶段和阶段内 section 完成后单独质检，并将真实结果、失败和遗留项写回本 README；
- 每个业务模块只提供自己的 Store/Mapper/Adapter，不把实体分支集中进同步或求职仓库上帝类；
- 通用同步内核只负责编排和持久化，不理解 Experience、JD、Resume 或 Tracker 业务规则；
- UI 默认读取本地 projection；网络请求由同步 Worker 执行，不让页面维护第二套同步状态；
- Direct API 只保留在线历史读取、兼容或服务端专用操作；所有业务写入必须经过不可变 Proposal、
  宿主审批、LocalSyncStore/Outbox 和乐观锁；
- UI 必须先给方案并取得用户确认；只复用现有 `tokens.css`、主题、Lucide 图标和既有控件语义，
  不复制硬编码颜色、不增加第二套主题；
- 所有业务代码和样式文件目标不超过 220 行、硬上限 250 行；超出前按职责拆分，禁止上帝类；
- 不把“后端接口存在”“能显示数据”或 Browser Demo 视为 App 阶段完成；必须具备真实调用、
  Docker 联调、失败路径、跨账号和必要的可见界面证据。

## 明确不进入本路线

- ResumeDraft/checkpoint 和原始文件云端同步；
- Experience 归属于 JD/Resume/Application 的永久绑定；
- JD 或 Resume 自己保存第二套投递状态；
- FactBank、事实证据/RAG UI、云端材料库、图片关联或原始文件上传；
- LLM/Agent 后端化；
- 支付链路、正式定价和订阅 Provider；
- 浏览器自动投递、邮箱读取和招聘网站自动化。

## 完成定义

只有 J0–J3、E0–E6、S4、S4.5 和 S5 全部通过后，才能在既有 P0–P5 基线上称完整产品链路已补齐：

```text
选择简历附件或粘贴 JD
→ 本地解析个人资料与可扩展经历并由用户确认
→ 独立经历仓库沉淀可复用事实
→ JD 作为岗位目标进入求职仓库
→ 结构化匹配分析并调用既有 G1–G7 生成有证据、达版面门槛的针对性 Resume
→ 从当前合格预览直接导出同一 revision 的 PDF
→ Resume 绑定来源 JD 并保存云端
→ 从 JD/Resume 创建同时引用二者的 Application
→ 在 Tracker 管理状态、面试、笔记与提醒
→ 在求职仓库、经历仓库和投递追踪间可追溯跳转
```

完成声明必须同时包含真实 Electron、Docker 后端、离线/冲突/跨账号、可访问性、性能和 250 行门禁证据。
通用材料管理、邮件读取、浏览器自动投递、支付和正式生产上线仍不计入功能完成范围；R1 单独决定
是否具备生产发布条件。不得因为后端接口已存在或 Browser Demo 可见就在 App 验收报告中暗示完成。
