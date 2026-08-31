# Coolto P0 产品能力补齐路线

> 状态：既有产品路线与完成记录保留为历史基线；后续开发已统一为一条正式执行链
> 当前阶段：BE7 AI Native Loops 代码闭环完成、真实运行验收待回补；BSF5 与 BE6 的真实平台验收同样延期
> 后续顺序：BE7 → BSF5/BE6 平台验收回补 → BE8 → S4.5 → S5 → R1
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
| S4.5 | 简历生成与交付修复 | 补齐个人资料、可扩展经历/技能、教育排版、十分钟生成目标与预览直接导出；保持既有工作/项目渲染和生成界面形态 | 信息有事实来源；门槛不降；每次真实用户命令的完整生成耗时不超过 600 秒（2026-08-18 由用户更新，见 Section F 门槛更新记录）；预览按钮直接导出当前合格版本；真实 Electron/PDF 质检通过 |
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
→ BE0（已完成）→ BE1（已完成）→ BE2（已完成）→ BE3（已完成）→ BE4（已完成）→ BE5（手动确认基线已完成）→ BSF0–BSF4（已完成）→ BSF5（实测延期）→ BE6（代码完成、macOS 验收延期）→ BE7（当前）→ BE8
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
| BE0 | [Browser Enhance 架构冻结](../browser-enhance/00-foundation/README.md) | 复用现有 Agent Harness，冻结 Agent/Harness/Adapter、grant、工具与威胁模型契约 | ✅ 2026-08-23 合同完成 |
| BE1 | Agent Browser Control | 复用现有 BrowserWindow/Tab/Page 底座，补 Agent 标签、导航、等待、混合观察和可逆交互原语 | ✅ 2026-08-23 完成；27/27 真实 Electron fixture 场景、全量 650 pass/2 skip |
| BE2 | Persistent Agent Harness | AgentTask、grant、事件邮箱、checkpoint、接管、暂停/恢复和审计 | ✅ 2026-08-23 完成；全量 669 pass/2 skip，Harness 10/10、任务 UI 11/11、BrowserBar 回归 29/29 |
| BE3 | Managed Job Scout | App 打开期间多源搜索、去重、匹配、Shortlist 和增量巡视 | ✅ 2026-08-23 完成；Greenhouse 15×2、Lever 383×2，重复 0，673 pass/2 skip，Shortlist UI 12/12 |
| BE4 | Managed Apply + Tracker | 多页填表、Answer Vault、SubmissionReceipt 与 Application Proposal | ✅ 2026-08-23 机制闭环完成；685 pass/2 skip，Browser 31/31、Harness 10/10、UI 14/14；真实域名 submit 仍待 BE8 逐域验收 |
| BE5 | Inbox Signals | 默认 Browser Webmail、可选 Gmail/Outlook 增量、Application 关联与状态/Interview Proposal | ✅ 手动确认基线完成；自动关联准确率仍未评估，所有 Tracker/Interview 写入保持逐条 Approval |
| BSF | Browser Shell Formalization | 独立 Browser 产品面、正式浏览器基础、Agent 可见层、新标签页与下载 | BSF0–BSF4 已完成；BSF5 Windows/macOS 剩余实测延期、未完成 |
| BE6 | macOS Calendar | EventKit 最小权限、映射、改期/取消和去重 | 代码实现完成；真实 Mac 编译、TCC、CRUD、重启与打包验收延期、未完成 |
| BE7 | AI Native Loops | Scout、Follow-up、Briefing、Strategy Learner 和风险提醒 | **代码与逻辑质检通过、实测待回补**：BE7.1–BE7.6 已完成专用授权、真实首轮/周期调度、数据/去重/停止契约、方向与来源校验、可展开产物、审批续跑及全量门禁；真实邮件/岗位/表单、长周期 timer 和通知验收仍未执行，详见 Browser Enhance 正式记录 |
| BE8 | Browser Enhance 真实交付 | 真实站点/账号、长任务、断网、崩溃、跨账号、安全与发布验收 | 待 BE7 完成；完整矩阵通过前不得称完全托管可用 |
| S4.5 | 简历生成与交付修复 | 个人资料、可扩展内容、教育排版、十分钟生成目标、预览直接导出与应用自动更新 | Section A–G、G-1 已完成；2026-08-29 L7–L12 WorkUnit 语义层与 5 份当前代码真实单次生成完成；L13–L17 已补齐首次经历引导、真正 `jd=null` 的独立通用简历及 tailored 8000 字后的策略卡；L19 新增用户坚持不匹配岗位并指定经历的 `user_directed` 路径，逐 Experience 基础简历优先、否则取其他简历最近版本，多来源合成且不做 JD adaptation，无 focus 均匀分配、有唯一 focus 多写，critical-skill 只警告且不触发 mismatch 卡；2026-08-30 新增独立本地用户原文件投递资产，不进入任何写作/匹配/复用链路，可由用户指定用于任意岗位；L18 general/fallback 与 L20 user-directed 的真实账号模型生成尚未执行，人工文字质量、Section H 和完整 token/质量对照仍待验收 |
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
- 2026-08-30 用户确认再次按岗位中心收敛求职仓库。本地 `ResumeDraftSummary` 与仓库本地摘要保留
  source snapshot 中已经冻结的 `jdId`、JD 标题和目标岗位；只读聚合使用逻辑 entry ID 将尚未保存到
  云端的 tailored 草稿展示到对应 JD，云端 Resume ID 与 Application 实际使用关系仍分开计算。通用
  草稿继续保持 `jdId=null`，已关联云端 Resume 仍以云端当前关系优先，没有新增关系表、业务写路径或
  Renderer 直写。
- 求职仓库默认岗位视角保持不变，“简历”改为次级“简历资产”；仓库顶部移除“生成通用简历”和
  “添加投递文件”，JD 主操作改为“准备岗位简历”。用户原始投递文件的底层加密保存、聊天入口和浏览器
  上传能力继续存在，但不再混入 Resume 列表或重复出现在每个 JD 详情；Resume→JD 改为可点击的反向
  关系导航。首次实现曾将 Tracker 与 Agent 任务移出主导航；用户对照原页面后明确这两个成熟入口必须
  保留，现已恢复侧栏“Agent 任务”和“投递追踪”，仓库内“投递记录”继续作为上下文快捷入口。暂停、
  继续、撤销授权及 Tracker 全视图均未删除；恢复后 Renderer typecheck、行数门禁、production build 与
  `git diff --check` 通过。
- 权限与写入边界未改变：Resume 保存仍需质量门与不可变 Proposal，Application 仍要求真实 `resumeId`
  并冻结 `resumeContentHashSnapshot`，Tracker/Experience/JD 写入继续走审批、Outbox 与乐观锁。新增本地
  tailored/general 关系回归后，专项 28/28、全量 851/851 tests、957 个源文件行数门禁、Node/Preload/
  Renderer typecheck、Node 与 Electron production build、`git diff --check` 全绿。首次 Electron 构建因
  上级目录 dataless `package.json` 被 esbuild 读取而返回 `EPERM`；门禁期间仅以带 `trap` 的精确临时改名
  绕过并已原位恢复，文件内容和属性未改变。真实本地 Electron 已启动到隐私知情同意页；未代用户接受，
  因此登录后岗位/简历关系与窄窗口的本轮人工验收仍待用户完成隐私同意后复验。本轮没有 commit/push。

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
  教育条目固定为第一行“学校 · 学历（左）—日期（右）”，第二行“专业 · GPA（专业排名）（左）—
  地点（右）”，第三行“主修课程”。GPA、专业排名和主修课程只展示经历来源中确实存在的值，缺失时
  省略对应片段，不补占位、不推断或编造。
- 预览和隐藏 Chromium 必须继续调用同一 renderer；只增加 section-specific presenter/field mapping，
  不复制第二套 HTML 模板。工作/实习和项目使用现有路径，新增 section 复用既有排版 token。
- 使用用户提供的两张截图作为问题证据，并建立结构快照、A4 截图和 PDF 页面渲染对比；视觉差异审查
  必须证明工作/项目区域除被新增内容自然推移外没有字体、间距、粗细、折行规则或信息层级变化。

**完成门槛**：个人资料和教育映射正确；技能位于最后；附加 section 顺序稳定；中英文、缺失字段、
极长值、一页边界均通过同源预览/PDF 回归，既有工作/项目视觉基线无非预期变化。

#### S4.5 Section F：十分钟生成性能闭环

- 优先减少物理模型往返：首轮用 `initialBindings` 生成完整有序草稿，后续用有上限的批量 patch 修复，
  不再按单条经历/单个 bullet 逐轮编写；为每个选中 source item 提供紧凑且均衡的证据摘要，减少反复
  `availableEvidence` 翻页，同时保持原始 EvidenceLedger 引用和 must-have 覆盖。
- 将布局合格后的确定性 quality review 由宿主自动串接，减少“请求下一工具”的空转模型轮次；左侧仍
  展示同样的实时 LLM 文本与工具过程，右侧仍在每个被接受的批次后刷新。不得合并或隐藏用户当前可见阶段。
- App 登录/空闲时预热隐藏 renderer 与字体；仅对完全相同的 structure、Profile、字体和 Chromium
  版本复用 compile 结果。若数据证明备选修复的 Chromium 编译是主要瓶颈，再实现上限为 2 的隔离
  BrowserWindow 池，并用串行/并行结果一致性测试证明无竞态、跨账号或字体差异。
- 性能硬门槛：每次真实用户生成命令都必须在 `≤ 600s`（2026-08-18 用户确认十分钟内可接受，覆盖
  2026-08-05 的 240s 旧门槛）内按 Section A 的完整端到端口径交付合格预览。正式打包应用不设置
  分钟级墙钟终止；600s 是验收观察门槛，应用仍保留复读、停滞、无进展和最大回合等异常保护。
  不建立合成样本、优化前基线、p95/median 或模型调用次数的独立验收指标；失败重试仍须计入，不得剔除。

**完成门槛**：获授权的真实用户生成命令均在 `≤ 600s`（2026-08-18 用户更新）内完成；一页/占用率/尾部、字体、证据、
must-have 和 quality review 结果不得下降；前端 DOM 结构、可见流程和交互截图无改变。

**S4.5 Section F 实施决策（2026-08-04，用户确认）**：

- **实测定位**：同模型（deepseek-v4-flash）、同设备、本地 Docker 同样本下，改造前后对比显示瓶颈是
  模型调用轮次与单次调用耗时（model_call 占总耗时 95%+），Chromium 编译不是瓶颈（每批 1 次、每次
  <1s）；改造后失败工具从每 run 3–16 次降到 0–3 次，en-data 样本两次到达 `ready_for_approval`
  （403s/18 轮、259s/13 轮），但总时长与调用次数仍不达标，且存在死循环（已加 40 轮上限兑底）。
- **待决策点（保留，未实施）**：① prepare 是否改为非原子（有效 initialBindings 先落地、无效条目
  返回拒绝清单）；② “正常成功路径 ≤4 模型调用 / median ≤120s”目标与当前 flash 模型稳定能力的差距
  处理（是否接受更多轮次或更换模型——更换模型会破坏“优化前后同模型”对比条件，需用户另行授权）；
  ③ 尾行修复指引已并入下方方案二，不再单独决策。
- **已确认实施组合（方案一 + 方案二 + 方案四，用户 2026-08-04 确认）**：
  1. **文本级增量操作**：`patch_resume_candidate` 新增 `append_text` / `prepend_text` /
     `insert_text` / `replace_substring` / `trim_text`；锚定用 visibleText 中的唯一子串（宿主校验，
     不唯一则报错并列出位置），模型不计算 offset；增量文本自带 evidenceIds，宿主拼回完整文本后整条
     照旧过 EvidenceLedger（区间不重叠、数字可追溯、quote 逐字、claim 检查），任一失败整批回滚；
     解析后内部统一复用 replace_bullet 路径，不引入第二套写入语义。
  2. **确定性写作清单**：投影新增 `writePlan`（逐 item 缺几条 bullet）、`tailFix`（shortByChars =
     deficitPx ÷ bodyFontSizePx × 语言系数，把 66.71% 尾行门槛翻译成“差 N 字”）、`overflowFix`
     （excessChars）；模型按清单增量补齐，门槛与每批一次编译不变。
  3. **配套**：失败聚焦重试（失败后只重发失败条目，不重发整批）+ 投影输入减负（structure 精简为
     id 索引树，全文只保留一份于 visibleText）。
  4. **明确不做**：先占位后填充（方案三，短占位会立即触发大量尾行违规）。
- **不变前提**：左侧 LLM 实时输出/工具过程、右侧实时预览、按钮与交互零改动；一页/占用率/尾行/
   字体/溢出/证据/must-have/quality review 门槛全部保留；同模型同设备同样本；本轮不 commit、不 push。
- **执行顺序**：契约与类型 → 应用与校验 → 证据解析 → 定向诊断投影 → prompt v18 → 失败聚焦 →
   输入减负 → 单测与 Electron QA → 3×1 小样本实测 →（达标趋势）3×10 完整验收 → `npm run check` +
   前端不变验证 + 写回本小节。

**S4.5 Section F 性能优化记录（2026-08-05，优化轮次 2/用户确认 L2→L1→L3→L5→L4→L6 顺序）**：

- **审计依据**：实测 pilot-before/after（1105s/41 轮、2064s/110 轮，均未达标）、pilot-cap（1105s/41 轮，
  86 个失败工具绝大多数为同一证据错误循环）、达标两次（259s/13 轮、403s/18 轮）、run-3x1（82s/144s
  但 `needs_revision` 提前终止）。模型调用占总耗时 95%+，单次调用 11–23s，与输入载荷大小正相关；
  重试根因是证据绑定约束求解被丢给 flash 模型逐轮重试；run-3x1 的“变快”是模型中途放弃的假象。
- **L2 输入减负（本轮完成）**：
  - 新增 `src/resume/workspace/model-payload.ts` 纯函数 `buildModelPayload`：只保留模型写作所需
    （structure id 索引、完整 visibleText、紧凑 evidenceBindings 仅 bulletId→evidenceIds、
    slim availableEvidence 仅 evidenceId/sourceQuote/matchedRequirementIds、预算/尾行/溢出/写清单/
    instruction）；去掉绑定原文 excerpts（占旧载荷 58%）、候选评分内部字段与 compile 原始 bullet 测量。
    `projectResumeWorkspace` 保持不变供 details/内部消费者与既有测试使用。
  - `source-projection.ts` 快照投影同样 slim，JD rawText 上限 800 字（超长加“原文已截断”标记）。
  - prompt 升 v19（移除对 evidenceBindings 全文的依赖表述）；context-policy 压缩占位文案同步。
  - trace 增加逐次 model call usage（input/output/cacheRead/reasoning，均来自 API usage，无正文）；
    `summarizeTrace` 拆至新文件 `trace-summary.ts`（store 曾达 254 行超上限，拆分后 213 行）。
  - 尺寸实测（同一合成样本，8 条绑定 + 12 条未消费候选）：投影 12.5KB → 7.6KB（-39%），候选字段
    3.9KB → 1.6KB；真实 run 绑定更多，收益接近 50%。
  - 验证：新增 `test/resume-model-payload.test.ts`（2 用例）、更新快照投影契约断言（候选不再携带
    sourceStart/valueScore）；`npm run check` 全绿（354/354 tests、542 源文件 ≤250 行、两端类型检查
    与构建通过）、`git diff --check` 通过。
  - **未做**：L1 证据宿主求解/批内部分生效、L3 续执行兜底、L5 预算前移、L4 确定性尾行补齐、
    L6 模型参数实验均未实施；真实模型调用对比留待 L1/L3 完成后统一 3×1 实测。

**S4.5 Section F 性能优化记录（2026-08-05，L1 完成/用户确认"宿主修复 + 逐条生效 + repairNotice"）**：

- **L1 契约变更（用户 2026-08-05 确认）**：证据绑定从"模型必须一次性选对、任一失败整批回滚"
  改为"模型提议、宿主机械修复"：数字缺引自动并入同经历含该数字的未使用候选；区间重叠自动替换
  为同经历未使用候选；同一 binding 内重复区间自动去重；只有确实无支持才失败，失败消息改为单点
  指令（"Remove the number …"）。同批操作逐条生效（成功的落地并一次编译，失败的按 index 返回
  精确错误），全部失败才整批抛聚合错误。prepare 的 initialBindings 同样非原子（待决策点①落地）。
- **修复可见性**：workspace 新增瞬态 `lastOperationReport`（repairs + rejected，不进 bestSnapshot
  与持久化草稿），`buildModelPayload` 以 `operationReport` 字段暴露给模型；模型 prompt 升 v20，
  明确"只重发 operationReport.rejected 对应 index 的条目，repairs 无需处理"。
- **归属与经历检查前移**：add/replace 的 item 归属（bullet_source_mismatch）与增量操作的跨经历
  证据检查（excerpt_experience_mismatch）从 apply 阶段提前到逐条解析阶段，使"逐条生效"契约完整，
  单条错误不再连坐同批其他操作。
- **质量门不变**：数字逐字校验、quote 逐字、claim 支持（基于整个经历原文）、EvidenceLedger 全量
  重放、一页/占用率/尾行/字体/溢出/must-have 与 quality review 全部原样；修复只改变"谁来解决
  证据不匹配"，不跳过任何编译与审查。
- **职责拆分**：新增 `evidence-auto-repair.ts`（修复主流程，204 行）、`evidence-candidate-selection.ts`
  （确定性候选选择/区间工具，94 行）、`evidence-single-operation.ts`（单条操作解析，213 行）；
  `evidence-resolution.ts` 收敛为公共入口（175 行）；全部 ≤250 行硬上限。
- **验证**：改写 6 个受契约变更影响的既有测试（整批回滚 → 部分生效、duplicate_source_range →
  自动换候选、EvidenceValidationError → 聚合 ResumeWorkspaceError 断言消息片段）；新增
  `test/resume-auto-repair.test.ts` 5 用例（数字自动并入、无支持才失败、8 条 excerpt 上限、
  prepare 非原子、增量合并自动修复）；359/359 tests 通过。`npm run check` 全绿（545 源文件
  ≤250 行、两端类型检查与构建通过），`git diff --check` 通过。
- **未做**：L3 续执行兜底、L5 预算前移、L4 确定性尾行补齐、L6 模型参数实验未实施；3×1 真实模型
  对比实测待账号/环境确认后执行。

**S4.5 Section F 性能优化记录（2026-08-05，L1+L2 后 3×1 实测，dev@example.com/本地 Docker）**：

| 样本 | 耗时 | 模型调用 | 失败工具 | 结果 | 与旧代码对比 |
| --- | --- | --- | --- | --- | --- |
| zh-ai | 218s | 17 | 0 | ready_for_approval | 旧 403s/18 轮达标；run-3x1 144s/6 轮未达标（提前放弃） |
| en-data | 422s | 16 | 1 | ready_for_approval | 旧 259s/13 轮、403s/18 轮达标 |
| zh-analytics | 547s | 34 | 5 | needs_revision | 旧 pilot-cap 1105s/41 轮未达标 |

- **L1 确认生效**：证据死循环（86 次同错重发）消失，失败工具降到 0–1；zh-ai 从"提前放弃未达标"
  转为 218s 达标。剩余失败模式变为模型行为问题而非契约问题：编造 evidenceId（格式合法但不存在）、
  用陈旧 revision 重发、insert 锚点不存在、repair 阶段修改冻结 bullet。
- **L2 telemetry 生效**：usage 逐次记录显示 cacheRead 1114k/输入 198k（缓存命中 ~85%），平均每次
  调用实际 prefill 仅 5.8–8.8k tokens；en-data 输出 50k tokens（模型每轮写大量文本）拉高单次调用
  到 26s，是 en-data 超时的主因。
- **与 180s 差距分析**：zh-ai 超 38s（21%），主要因 patch 轮次多（prepare 后 ~14 次 patch）；
  en-data 超 242s，主要因单次调用输出过大（首轮草稿密度不足 → 每轮大量补写）；
  zh-analytics 超 367s，模型乱来循环（编造 ID/旧 revision/冻结 bullet）消耗 34 轮。
- **下一步**：L5 预算前移（首轮 initialBindings 条数按页面预算硬约束，砍 patch 轮次）；
  编造 evidenceId 防护（错误消息移除 valid examples，防模型模仿格式拼接）；
  L3 续执行兜底（本轮无"提前放弃"现象，优先级下调）。

**S4.5 Section F 性能优化记录（2026-08-05，L5+ID 防护完成）**：

- **L1 遗留 bug 修复**：`resolveInitialBindingsBestEffort` 原来每条 binding 独立 `new Map()`，
  prepare 阶段两条 initialBindings 引用同一候选时冲突漏修（en-data 实测 prepare 失败根因）；
  现累积 work Map，后续绑定自动换候选。
- **L5 预算前移**：`writePlan` 每 item 增加 `unusedEvidenceCount`（该经历剩余未消费候选数）；
  writing instruction 从"roughly N more bullets"改为逐经历分配建议
  （"item-X needs 2 more (5 unused evidence); …; Submit one complete batch now, not a single
  lengthen-only tweak"），引导模型一轮补多条而非逐轮小步加长（zh-ai 实测 14 轮 patch 中
  bindings 恒为 12、全靠加长从 53.8% 爬到 85.8%，是超时主因）。
- **编造 ID 防护**：`unknown_evidence_id`（格式合法但候选不存在）从硬错误改为宿主按"同经历
  最高价值未用候选"替换（repairs 记录 `unknown_evidence_id/replaced`），数字与 claim 门继续
  兜底；错误消息移除 valid examples（模型此前模仿其格式拼接假 ID）；该经历无候选时仍失败并
  强调"copy verbatim"。
- **职责拆分**：`workspace-projection.ts` 收敛为投影入口（88 行），诊断/指令/写清单迁至新增
  `diagnostics-projection.ts`（185 行）；两文件均 ≤250 行。
- **验证**：新增 4 个回归测试（prepare 累积 work、unknown ID 替换、无候选失败、writePlan
  未用证据计数），auto-repair 专项 9/9 通过；`npm run check` 全绿（364/364 tests、546 源文件
  ≤250 行、两端类型检查与构建通过），`git diff --check` 通过。

**S4.5 Section F 性能优化记录（2026-08-05，L3 续执行兜底完成）**：

- **动机（第二轮 3×1 实测）**：zh-ai 156s/15 轮、en-data 162s/13 轮均达标 ≤180s；zh-analytics
  267s/11 轮未达标，终止模式为"第 9 轮工具错误后模型直接停止，workspace 停在 needs_revision/
  56.5%"——模型放弃而非继续，正是 run-3x1 出现过的"快但未达标"失败模式。
- **实现**：新增 `src/desktop/main/resume-continuation.ts`（不依赖 electron 的纯逻辑）：
  `continueUntilTerminal` 在 agent 停止后检查 workspace 状态，writing/needs_revision 时用
  `wrapInternalPrompt(instructionFor(workspace))`（既有 internal 标记，自动被聊天投影过滤）
  续接重prompt，默认上限 2 次，防止模型能力不足时无限接力。`DesktopAgentRuntime.prompt` 与
  `runPerformanceSession` 均接入，真实 App 与 QA 口径一致；续接轮次的模型调用/工具事件照常
  进入 trace 与左侧工具展示。
- **验证**：新增 `test/resume-continuation.test.ts` 4 用例（状态判定、贴上限续接、终态提前停止、
  自定义上限）；`npm run check` 全绿（368/368 tests），`git diff --check` 通过。

**S4.5 Section F 性能优化记录（2026-08-05，冲突替换 bug 修复 + R4 实测）**：

- **实测暴露的替换 bug**：R3 实测出现不带修复后缀的 `duplicate_source_range`（EvidenceLedger 层），
  定位为 `repairRangeConflicts` 与 `repairUnknownEvidenceIds` 逐条替换冲突 excerpt 时可能把
  两条引用换到**同一个未用候选**（只排除被替换单条，未排除本条已占用区间），产生 `[C, C]`
  内部重叠。修复：`firstUnusedCandidate` 增加 used 区间列表参数，替换时排除本条全部已用区间；
  新增 2 个回归测试（无替代时 throw 而非产出重复区间、有替代时保持区间互异）。patcher 增加
  EvidenceLedger 冲突诊断（错误消息附 resolved 批次区间快照），成功路径零影响。
- **R4 实测（冲突修复后）**：zh-ai 303s/17 轮 ready_for_approval、en-data 342s/17 轮
  needs_user_decision（三轮修复用尽/来源缺失）、zh-analytics 278s/23 轮 ready_for_approval
  （**首次达标**，此前 4 轮从未达 ready）；三样本失败工具全部为 0（R1 之后错误循环彻底清零）。
- **剩余卡点**：达标样本调用数 15–23 轮（prepare 后 ~14 轮 patch，模型仍小步走），单次调用
  12–25s；同代码样本间方差大（zh-ai 156↔474s），180s 硬门槛下尚不稳定。待决策：L4 宿主确定性
  补齐（砍 patch 轮次，需确认"宿主代写"展示形式）或 L6 模型参数实验（显式禁用 thinking/
  temperature，砍单次调用耗时，需授权）。

**S4.5 Section F 性能优化记录（2026-08-05，L4 尾行补齐 + L6 temperature=0 完成）**：

- **L6 实测发现**：pi-ai 的 deepseek thinkingFormat 分支在 thinkingLevel=off（reasoningEffort 为空）
  时已发送 `thinking: {type: "disabled"}`（deepseek-v4-flash 的 thinkingLevelMap 无 off 键，
  `undefined !== null` 触发 disabled 分支）——"显式禁用 thinking"已生效，无收益空间；R1–R4 的
  usage 均无 reasoning 字段佐证。L6 收缩为 `temperature=0`：`createDeepSeekDependencies` 以
  streamFn 包装注入（产品代码内，不改 node_modules），降低模型随机性带来的方差与乱来轮次。
- **L4 尾行确定性补齐（用户 2026-08-05 确认"工具活动形式"）**：
  - 新增 `tail-fill.ts`（161 行）：`buildTailFillOperations` 仅在编译结果为纯尾行违规
    （violations 全是 bullet_tail_too_short）时，从同经历未用候选取下一条证据句（逐字原文、
    长度覆盖 shortByChars 且 ≤120 字）；`tryTailFill` 走同一条 resolveOperationsBestEffort
    + EvidenceLedger + Chromium 编译，追加后出现 overflow/multiple_pages 或非尾行违规变多时
    整批回滚。每批最多 2 条。
  - `candidate-patcher` 在模型 patch 编译后自动执行 tail-fill，repairs 记录
    `kind: "tail_fill"`，随 operationReport 暴露给模型。
  - 左侧展示（已确认）：`AgentRuntimeEvents` 在 resume 工具成功且存在 tail_fill 修复时注入
    宿主工具活动伪事件（"自动补齐尾行：bl-3…"）；`ToolActivity.vue` 与 `agent-event-handler`
    支持 label 字段显示中文说明，右侧预览不变。
  - `bulletTailDiagnostics` 签名放宽为 `Pick<compileResult|structure>`（消除 tail-fill 的 cast）。
- **验证**：新增 `test/resume-tail-fill.test.ts` 3 用例（纯尾行状态才触发、patcher 自动补齐并记录
  repairs、每批上限 2 条）；`npm run check` 全绿（372/372 tests、548 源文件 ≤250 行、两端类型
  检查与构建通过），`git diff --check` 通过。

**S4.5 Section F 性能优化记录（2026-08-05，L3 生效 + 3×3 统计实测）**：

- **产物链路修正**：electron 实际加载 `out/`（electron-vite 产物，`desktop:build`），此前 R5–R7
  多次 QA 误用旧产物（`npm run build` 只输出 `dist/`）；修正后 L3 续执行真实生效（continuation
  日志确认每样本触发续接轮）。
- **L3 上限 2→4**：实测显示模型"提前停"（prepare 后 5–8 轮即停）是主要失败模式，2 轮续接救不回；
  上限提到 4（测试随常量自适应）。
- **3×3 统计实测（L1–L6 全部生效，9 runs）**：

| 样本 | 达标情况 | 失败模式 |
| --- | --- | --- |
| zh-ai | 1/3（197s PASS；186s/238s 提前停） | 7–8 calls 提前停 |
| en-data | 1/3（75s PASS；240s 提前停、97s needs_user_decision） | 提前停 / 三轮修复用尽 |
| zh-analytics | 0/3（507s/352s/499s） | 15–21 calls 长跑但到不了 ready（writing/needs_user_decision/needs_revision 各种停） |

- **结论**：L1 的确定性收益稳固（9 runs 全部 0 工具错误）；模型行为方差成为唯一剩余变量
  （提前停、过度长跑、空转轮互现，同代码同样本 75s↔507s）；zh-analytics 代表"JD 匹配度低的
  困难样本"，模型内容产出受 availableEvidence 质量制约，稳定超时。
- **待决策**：① L3 变体（移除轮数上限、以总调用数/总时长兜底，救"提前停"类样本）；② L4 完整版
  （宿主从证据句确定性组装 add_bullet 补条数，救内容不足的困难样本，需确认展示形式）；③ 3×10
  正式验收（当前 2/9 达标率大概率不过）。

**S4.5 Section F 性能优化记录（2026-08-05，L3 变体 + L4 完整版完成，一次性完善后实测）**：

- **L3 变体（budget 兜底续接）**：`continueUntilTerminal` 从"固定 2/4 轮上限"改为
  `ContinuationBudget { maxMs: 160s, maxModelCalls: 30 }` 双兜底循环：非终态且预算内时，
  先由宿主补条（见下），再以 `wrapInternalPrompt(instructionFor(workspace))` 续接模型；
  防御性轮数上限 200。`CooltoAgent` 新增 `modelCallCount` getter（订阅 assistant
  message_start 计数，跨全部 prompt 累计），真实 App 与 QA 共用同一预算。
- **L4 完整版（宿主确定性补条）**：新增 `section-fill.ts`：workspace 为 writing/needs_revision
  且无 overflow 时，按 writePlan.missing 降序取各经历最高分未用证据句，逐字组装 add_bullet
  （每批 ≤2 条），走同一 resolveOperationsBestEffort + EvidenceLedger + Chromium 编译，
  overflow/非 underfilled 违规变多则整批回滚；补条后 workspace revision+1 并写回 store。
  左侧以工具活动"自动补充：item-X…"呈现（复用用户已确认的工具活动形式，`emitHostFill`）。
- **接线**：`ConversationAgentContext` 增加 `resumeCompiler`；`DesktopAgentRuntime.prompt`
  与 `runPerformanceSession` 均传入 compiler + 预算 + 回调（真实 App 发宿主活动事件，
  QA 写 continuation 日志）。
- **验证**：新增/更新 `test/resume-continuation.test.ts`（5 用例：宿主补条直接终态、budget
  兜底、终态提前停止、终态起点、宿主补条记录）；`npm run check` 全绿（377/377 tests、
  549 源文件 ≤250 行、两端类型检查与构建通过），`git diff --check` 通过。
- **实测待执行**：一次性 3×3（9 runs）验证 L3 变体 + L4 完整版整体效果。

**S4.5 Section F 性能优化记录（2026-08-05，宿主内容填充扩展 + 全局预算修正）**：

- **实测暴露的两个问题**：① section-fill 原实现只在 writePlan.missing>0 时补条，真实场景模型
  通常是"条数够但占用率不够"，宿主补条从不触发（日志确认 0 次 hostFill）；② 续接预算从续接
  开始计时（160s），主 run 的 30–40s 另算，180s 门槛的时间分配错误。
- **section-fill 扩展为宿主内容填充**：触发条件放宽为 `pxToMinimum > 0`（占用率缺口）或
  writePlan.missing>0；先按 missing 补 add_bullet（原文句），再按经历把剩余未用证据句
  append_text 到该经历现有 bullet（每批 ≤3 条）；`introducesWorseViolations` 提取到
  candidate-patch.ts 与 tail-fill 共享。
- **全局预算**：`ContinuationBudget` 增加 `startedAtMs`，默认 maxMs 170s 从用户命令开始计时；
  `DesktopAgentRuntime.prompt` 与 `runPerformanceSession` 均以主 run 起始时刻传入。
- **验证**：`npm run check` 全绿（377/377 tests、549 源文件 ≤250 行），`git diff --check` 通过。
- **实测待执行**：最终一次性 3×3（9 runs）。

**S4.5 Section F 质量验证记录（2026-08-05，用户确认"略高于三分钟也可接受"）**：

- **质量快照与 PDF 导出**：perf QA 每个 run 结束时导出完整质量快照（usageRatio、violations、
  qualityReport、JD 覆盖、bullet/binding 数、unwritten），`ready_for_approval` 时经
  `compileForPdf` 导出 A4 PDF + 截图到 artifact 目录（`resume-<sample>-<iter>.pdf/png`）；
  逻辑拆至新增 `resume-performance-quality.ts`（保持 session 文件 ≤250 行）。
- **两个宿主侧完善**：① tail-fill 触发条件放宽——允许 `page_underfilled` 与尾行违规并存时
  补尾行（此前 underfilled 时禁用，而实测中"占用率不足 + 尾行违规"恰是常态，补尾行同时
  提升占用率）；② 续接预算 maxMs 170s→200s（匹配用户"略高于三分钟"口径）。
- **质量实测（3×2，6 runs）**：
  - **en-data #2：完全达标**——86.9s，`ready_for_approval`，usage 85.68%（≥85%）、
    qualified/qualityPassed 均为 true、quality score 1.0、violations 与 qualityIssues 全空、
    12 bullets、JD 覆盖 3/3、unwritten 空；A4 PDF（1 页，309KB）与 PNG 已存档
    `s45f-perf/qualified-evidence/resume-en-data-02.{pdf,png}`。
  - 其余 5 run：needs_revision，**内容层全部达标**（unwritten 空、JD 覆盖 3/3、无 quality
    issue、证据绑定完整），仅剩布局层（usage 51–77% 需 ≥85% + 尾行违规）——模型在布局
    未修完时停止，210–266s（略超三分钟）。
  - 结论：**能输出完全符合质量门槛的简历**（en-data #2 为证据）；剩余问题是模型布局收尾的
    稳定性（尾行/占用率），宿主 tail-fill 放宽与 200s 预算已落地，待 3×N 复测确认收敛趋势。

**S4.5 Section F 质量复测记录（2026-08-05，tail-fill 放宽 + 200s 预算后 3×3）**：

- **达标 2/9**：zh-ai #2（140.5s，usage 86.1%，score 0.99，16 bullets）与 en-data #3（223.0s，
  usage 88.6%，score 1.0，12 bullets），均为 `ready_for_approval`、violations/issues 全空、
  JD 覆盖 3/3、0 工具错误；两份 A4 PDF 已存档
  `s45f-perf/qualified-evidence/resume-zh-ai-02.pdf`、`resume-en-data-03.pdf`。
- **"差一步"样本**：en-data #2 usage 85.6%（≥85%）仍 needs_revision，仅剩 bl-9 一条尾行
  （64.3% vs 66.71%）；31 轮中被 3 次工具错误（旧 revision 重发、证据无未用候选）消耗。
- **zh-analytics 依旧最弱**（49–64% 占用率，6–12 calls 提前停）：内容产出受 JD 匹配度低的
  availableEvidence 制约，宿主无可补证据句。
- **累计质量证据**：三轮实测共 3 份完全合格简历（86.9s/140.5s/223.0s，score 0.99–1.0），
  证明"能输出符合质量门槛的简历"；不达标样本的内容层（unwritten/JD 覆盖/证据/quality issue）
  全部达标，剩余差距集中在模型布局收尾稳定性与 zh-analytics 类困难样本。

**S4.5 Section F 证据不足告知记录（2026-08-05，用户确认"归一状态+指令告知 / 模型重选"）**：

- **问题**：needs_user_decision 只在质量审查三轮用尽时产生；"布局占用率不足"（zh-analytics 型）
  停在 needs_revision，L3 预算耗尽后用户只看到半成品草稿，无任何"证据不足"说明。
- **归一状态**：`continueUntilTerminal` 预算耗尽（maxMs/maxModelCalls）且 workspace 仍
  writing/needs_revision 时，宿主把状态归一为 `needs_user_decision`（revision 不变，仅
  status + structure.quality_status），模型按终态指令向用户说明。
- **指令告知**：needs_user_decision 的 instruction 改为明确中文说明——"当前所选经历的证据
  不足以生成满足全部门槛的简历（页面占用率 X%，需 ≥85%…）"，给出两条出路：补充/完善经历，
  或要求 AI 放宽匹配条件（search_experiences 更宽条件 → 新快照 → 新候选）；明确"不得降低任何
  质量门槛"。
- **降阈值重生成**（用户确认走现有工具链）：system-prompt v21 增加引导——证据不足时如实说明；
  用户要求继续/放宽时，search_experiences 以更宽条件纳入更多相关经历，重新
  get_resume_source_snapshot + prepare_resume_candidate 生成新候选。
- **验证**：新增 2 个测试（预算耗尽归一 needs_user_decision、needs_user_decision 指令含证据
  不足说明与放宽路径）；`npm run check` 全绿（379/379 tests、549 源文件 ≤250 行），
  `git diff --check` 通过。
- **3×1 实测（归一后）**：zh-ai 247s/11 calls（usage 52.3%）、en-data 170s/19 calls
  （usage 84.2%）、zh-analytics 202s/30 calls（usage 47.8%，调用数上限触发）全部归一为
  `needs_user_decision`——不再静默停在 needs_revision；模型结束回复将按指令向用户说明
  证据不足与两条出路（补充经历 / 放宽匹配重选）。真实 Electron 对话验收归入后续人工验收。

**S4.5 Section F 性能门槛更新记录（2026-08-05，用户确认）**：

- **正式门槛由 `≤180s` 放宽为 `≤240s`**（"略高于三分钟"）；理由：已验证的达标样本最高 223s
  （en-data #3），180s 在 flash 模型行为方差下无法稳定达成；240s 覆盖已证达标的全部样本并
  留余量。zh-analytics 类困难样本（228–500s）仍可能超时，验收时如实报告不达标次数与原因。
- **同步更新**：阶段表格 S4.5 行、Section F 性能硬门槛与完成门槛、用户确认结果（2026-08-02）
  中的 180s 引用全部改为 240s（历史实测分析记录保留原文）；`PERFORMANCE_GATE_MS = 240_000`
  写入 `run-resume-performance-qa.mjs` 验收判定；续接预算 `DEFAULT_CONTINUATION_BUDGET.maxMs`
  200s→230s（240s 门槛留 ~10s 给保存/审批）。质量门槛（一页/占用率/尾行/字体/证据/must-have/
  quality review）不降。
- **剩余验收项**：按新门槛执行 3×10 正式验收（`COOLTO_RESUME_PERF_RUNS=10`），记录达标率、
  超时样本与原因；真实 Electron 对话验收（证据不足告知、放宽匹配重选）归入人工验收。

**S4.5 Section F 3 行 bullet 配置记录（2026-08-05，用户决定）**：

- **决定**：bullet 允许写到 3 行，主链路支持可配置（默认 3，`COOLTO_RESUME_MAX_BULLET_LINES=2|3`
  可回退 2 行）。依据：规划实验证明"≤2 行 + 85% 页面 + 现有材料"数学不可兼得（zh-ai 需 22 条
  但证据只够 ~16 条 2 行 bullet，上限 ~76%）；模型实测达标样本本就依赖 3 行 bullet。
- **实现**：`AppConfig.resumeMaxBulletLines`（默认 3，枚举校验 2/3）；`ResumeWorkspace.maxBulletLines`
  （可选字段，兼容旧草稿默认 3）；`ResumeCandidatePreparer` 选项注入（agent-context-factory 从
  config 传入）；`bulletCharTarget` 字符上限 = charsPerLine × maxBulletLines（3 行 → 中文
  92–165 字，2 行 → 92–110 字），`instructionFor` 的 remainingBullets 估算随行数调整；
  system-prompt v23 与 snapshot draftPlanRule 文字同步"1.7–3 行"。
- **实验目录同步**：planner 默认 maxBulletLines=3；材料不足判定（estimatedMaxUsageRatio<85%）
  与自动扩充流程（按 JD 匹配度纳入更多经历，穷尽才通知补经历）已实现并通过真实数据验证
  （zh-analytics 自动 +1 条 → 90.9%）。
- **验证**：config 测试扩展（默认 3、env 覆盖 2、非法值拒绝）；npm run check 全绿
  （379/379 tests、550 源文件 ≤250 行、两端类型检查与构建），git diff --check 通过。

**S4.5 Section F 完成记录（2026-08-05，用户确认记为完成）**：

- **判定**：用户以真实 Electron 验收（简历生成链路优化：技能板块、无重复、尾行合规、AI 自主规划工具
  inspect_resume_layout/prepare_planned_resume）确认"没问题，后期再做其他优化"，按当前正式门槛
  （≤240s、质量不降、前端形态不变）记为完成。
- **完成证据**：
  - 工程侧：L1 证据宿主修复（数字/重叠/编造 ID）+ 批内逐条生效；L2 模型载荷瘦身与 usage 遥测；
    L3 预算兜底续接 + 证据不足归一告知；L4 尾行/条数确定性补齐（工具活动展示，用户确认）；
    L5 预算前移（writePlan 未用证据计数）；L6 temperature=0、thinking 可配置；3 行 bullet 可配置
    （默认 3）；技能固定板块（软证据、单条目）；产出不足自动扩经历；AI 自主布局规划（inspect +
    layout 参数，程序仅校验预算/证据唯一性/材料上限）；写手重复片段检测。
  - 质量：多份完全合格简历证据（86.9s–237.5s，score 0.99–1.0，占用率 85.2%–95.9%，零违规、
    JD 覆盖 3/3、证据绑定完整）；zh-analytics 类材料不足样本经自动扩经历首次达标。
  - 门槛与工具：240s 正式门槛（用户确认放宽）、PERFORMANCE_GATE_MS、质量快照 + 合格 PDF/PNG
    导出、trace usage 记录。
- **遗留项（如实记录，不隐瞒）**：
  1. 达标率存在模型方差：部分真实命令未在 240s 内合格交付（zh-ai 首轮 50–85% 波动、zh-analytics
     类材料不足样本），程序兜底为自动扩经历 + 证据不足告知 + needs_user_decision 归一；
  2. 3×10 全量量化验收未执行（用户决定不再跑长测试）；量化达标率（约 1/4–1/3）为观测值非验收值；
  3. 写手产出质量方差与困难样本处理归入后期优化（用户明确"后期再做其他优化"）；
  4. 真实 Electron 对话验收通过，但完整回归（中英文/深浅主题/宽窄屏/200% 缩放/键盘）归入
     Section H 统一质检。
- **状态**：S4.5 Section A–F 完成；Section G（当前预览直接导出）与 Section H（统一质检）未开始。

**S4.5 Section F 模型与思考实验记录（2026-08-05，thinking 配置化 + pro 对比）**：

- **thinking 配置化**：`AppConfig` 新增 `thinkingLevel`（`COOLTO_AGENT_THINKING_LEVEL`，
  默认 `off`，枚举校验），经 `createCooltoAgent`/`CooltoAgent` 透传到 pi-agent-core
  （deepseek-v4 系列仅支持 off/high/max）；prompt 升 v22（bullet 长度硬要求：中文 85–105 字/
  英文 160–200 字符、首轮写满 planned 条数 ≥70% 占用率、宁长勿短；instruction 增加
  "every existing bullet must reach the same target length"）。
- **flash+high 3×1 实测**：thinking 确实解决"写不满"——zh-analytics 首次 `ready_for_approval`
  （876s/85.6%/score 0.986）；但单次调用 40–62s，总耗时 300–876s，性能不可接受；zh-ai/en-data
  占用率反而下降（想太多、动得少）。
- **pro+off 3×1 实测（配置 `COOLTO_MODEL=deepseek-v4-pro`）**：三样本占用率 85.7–95.9%
  （历史最高），zh-ai 231s/score 1.0、en-data 176s/score 0.99 均 `ready_for_approval` 且
  ≤240s；zh-analytics 235s/85.7%/score 0.99 内容达标，30 次调用上限触发、差布局收尾一步
  （归一 needs_user_decision 可续）。单次调用 ~9s（pro 基座输出效率高、返工少），工具错误
  0–2 次/run。**pro+off 暂为最优配置，是否定为正式配置待 3×3 稳定性复测后决策。**

#### S4.5 Section G：当前预览直接导出

- 保留预览右上角现有导出按钮及视觉样式；点击后直接调用专用 `resume-drafts:export-pdf` IPC，传递当前
  artifact ID 与 expected revision。Main 必须重新读取同一草稿，拒绝陈旧 revision、pending change、
  未达到 `ready_for_approval` 或编译/质量门槛不合格的版本。
- 复用现有系统保存对话框、同源 Chromium compile、postflight 和原子写文件；取消不报错，失败提供
  可重试错误。此操作不创建聊天消息、不调用 LLM、不生成 ApprovalCard，也不导出比当前预览更新或
  更旧的隐式版本。

**完成门槛**：真实 Electron 点击一次即可保存并打开当前预览 PDF；文件内容 hash/revision 与预览一致，
取消、同名文件、无权限、磁盘失败、陈旧版本和未合格版本均安全；聊天事件和模型调用数保持不变。

**S4.5 Section G 完成记录（2026-08-06）**：

- **行为变更**：预览右上角导出按钮从"向聊天发送'请将右侧当前简历导出为 PDF 到本地文件。'指令"
  改为直接调用专用 `resume-drafts:export-pdf` IPC（按钮位置、图标与禁用条件不变；禁用条件继续要求
  `ready_for_approval` 且 `qualified` 且无 `pendingChange`）。该操作不创建聊天消息、不调用 LLM、
  不生成 ApprovalCard，也不导出比当前预览更新或更旧的隐式版本。原聊天指令路径（Agent 导出审批）
  保留未动，聊天内仍可要求导出。
- **Main 侧重新读取与门禁**：`ipc.ts` 新 handler 经
  `src/desktop/main/resume-drafts/resume-draft-ipc.ts` 注册，Main 重新读取同一草稿并构建不可变
  payload：`workspace.revision !== expectedRevision` 拒绝（`stale_candidate_revision`）、存在
  `pendingChange` 拒绝（`draft_has_pending_change`）、非 `ready_for_approval` / `qualityReport` 未
  通过 / `structure.quality_status` 未通过 / `compileResult` 未合格拒绝（`candidate_not_exportable`）。
  随后复用既有 `ResumePdfExportService`（系统另存为对话框、同源 Chromium `compileForPdf`、PDF
  postflight 完整性、原子写文件）；取消返回 `cancelled` 不报错，失败保留可重试错误。
- **新增纯逻辑**：`src/resume/export/draft-export.ts`（77 行，无 electron 依赖）：`buildDraftPdfExportPayload`
  校验并构建 payload（structureHash、`resumePdfFilename`、候选 ID/修订、冻结 structure/compileResult），
  `isExportableWorkspace` 供复用；`ResumePdfExportError` 增加 `stale_candidate_revision` 与
  `draft_has_pending_change` 两个 code。
- **契约与接线**：`ResumeDraftDetail` 增加 `revision`（`draft-view.ts` 从 `workspace.revision` 投影）；
  新增共享 `ResumeDraftExportPdfInput` / `ResumeDraftExportPdfResult`；`UserServices` 暴露既有
  `resumePdfExports`；preload、`unavailable-desktop-api` 与 demo api（返回 `cancelled`）同步补齐；
  `ResumePdfCompilation.pdf` 类型由 `Buffer` 收紧为 `Uint8Array`（消除共享契约对 node 类型的依赖，
  消费方仅使用 `byteLength`/写文件，不受影响）。
- **Renderer 反馈（用户 2026-08-06 确认"状态提示复用现有样式"）**：`use-resume-workspace` 新增
  `exportActiveDraft`、`exporting` 与瞬态 `exportMessage`（4 秒后自动清除）；导出中按钮转加载态
  （`LoaderCircle.spin` + 禁用），成功后按钮旁短暂显示"已导出到 {file}"轻提示，取消静默，失败复用
  ArtifactPanel 现有错误条样式展示可重试错误；中英文新增"正在导出…"/"已导出到 {file}"两条文案。
- **文件行数**：`ipc.ts` 因新增 handler 超出 250 行硬上限，已按既有 `register*Ipc` 模式把
  `resume-drafts:*` 全部七个 IPC 收敛进新的 `resume-draft-ipc.ts`（102 行），`ipc.ts` 回落至 248 行；
  新增业务文件均 ≤220 行目标。
- **验证证据**：新增 `test/resume-draft-export.test.ts` 8 个纯单测（合格 payload 构建与结构深拷贝、
  陈旧 revision、pendingChange、非终态、缺 qualityReport、quality_status 未通过、compile 未合格、
  `isExportableWorkspace` 各失败模式）；`npm run check` 全绿（389/389 tests、570 个源文件 ≤250 行、
  模板快照、Node/preload/renderer 类型检查与两端构建通过），`git diff --check` 通过。本轮未 commit。
- **遗留项（如实记录）**：真实 Electron 点击一次保存并打开 PDF、取消/同名/无权限/磁盘失败及陈旧/
  未合格版本安全性的端到端实测未在本轮执行——按用户 2026-08-06 决定，Section H 及真实 App 验收
  由专职测试人员按 Section H 标准执行（含本 Section 门槛逐项复核），不以本轮自动门禁提前宣称
  Section G 完成。

**S4.5 当前预览行间距调节补充记录（2026-08-26，用户确认）**：

- **产品与交互**：预览打开且存在本地草稿时，在右上角高级详情与保存按钮之间增加复用 Lucide 与既有
  popover token 的“调整行间距”入口；滑块固定展示 `90%–135%`、步长 `1%`、默认 `100%`，同时提供
  减小、增大和还原默认的点击/键盘路径。拖动时 A4 立即预览，松开后才提交正式本地修订；中英文、
  `aria-label`、`aria-valuetext`、Esc 收起、点击外部收起和焦点返回均接入。
- **一页硬门禁**：右侧同源 A4 DOM 逐档测量每个候选行距，以 `pageCount=1`、`overflow≤1px` 和既有
  最大页面占比作为动态安全上限；完整轨道仍可见，但安全上限之后显示为不可用尾段，滑块不能进入，
  到达边界时显示“继续增大将超过一页，已到达当前安全上限”。Main 保存前再次使用隐藏 Chromium 编译
  同一结构；任何多页、溢出或超过页面占比上限的结果均拒绝写入并保持原行距，因此 Renderer 估算不会
  成为唯一安全边界。
- **持久化与同源交付**：行距写入既有 `layout_tuning.body_line_height`，不修改或补写正文；成功调整会
  增加本地 revision 和“调整行间距”checkpoint，并带 expected revision 防止并发覆盖。预览、保存到
  简历库与 PDF 导出继续消费同一结构，新增回归明确验证保存/导出 payload 保留该 tuning；pending AI
  修改存在时入口禁用，文字自动保存会在行距提交前先完成。
- **验证证据**：新增纯逻辑与草稿服务回归，覆盖 `90%–135%` 映射、模板基线防漂移、动态上限、陈旧
  revision、一页拒绝、checkpoint、保存/导出同源；`npm run check` 全绿（686/686 tests、758 个源文件
  ≤250 行、模板快照、Node/preload/renderer 类型检查与两端构建通过），`git diff --check` 通过。真实
  Electron 已复验按钮位置、popover 视觉与可访问结构；隔离内存 Demo 中当前样本在 `101%` 达到安全
  上限，加号随即禁用、警告出现且无法继续增大，重置后回到 `100%`。Demo 未写入真实业务数据；本轮
  未另行导出真实文件，完整 PDF 人工质检仍随既定 Section H 执行。本轮未 commit。

#### S4.5 Section G-1：应用自动更新闭环

- 在既有 electron-builder 打包链（`electron-builder@26`，`package:mac`）上接入 `electron-updater`：
  登录进入工作区后静默检查一次更新并后台下载，下载完成提示重启安装；左下角账户菜单提供手动
  "检查更新"入口；更新源 URL 可配置（环境变量 `COOLTO_UPDATE_FEED_URL` 覆盖，默认本地静态
  服务器地址，与 API 基址处理方式一致）；electron-builder 预留 mac/win/linux 三个平台的
  publish/发布配置，本次只验收 macOS。
- macOS 自动更新依赖 Developer ID 签名（当前 `electron-builder.yml` 为 ad-hoc `identity: "-"`），
  真实自动更新无法在无签名下运行，因此本 Section 采用"本地模拟验收先行"：同源 ad-hoc 打包包 +
  本地静态目录 + `dev-app-update.yml` 跑通"发现新版本 → 后台下载 → 重启安装"全流程；真实签名、
  公证（notarization）与远端发布基建归 R1。
- 更新检查/下载失败必须 fail-closed：不影响启动、不阻塞业务主路径，错误只进入菜单状态并可重试。
- 新业务 TypeScript、Vue 和 CSS 文件以 220 行为目标、250 行硬上限；更新服务、状态映射、IPC 与
  组件各自职责单一，不建立万能 Updater Manager。

**完成门槛**：登录后静默检查、后台下载、下载完成徽标与"重启并安装"提示、手动检查入口与全部
状态文案可用；检查失败不阻塞启动；`npm run check` 全绿、行数门禁与 `git diff --check` 通过；
本地模拟验收通过（打包 v0.1.0 → 本地源发布 v0.1.1 → 启动发现新版本 → 下载完成 → 重启安装后
版本变为 v0.1.1）；ad-hoc 签名限制与真实发布遗留项如实写回。

**用户确认结果（2026-08-06）**：

- 签名策略：本地模拟验收先行；真实 Developer ID 签名、公证与远端发布留到 R1。
- 更新源：本地目录 + 可配置 URL（环境变量 `COOLTO_UPDATE_FEED_URL`，代码默认本地地址）。
- 更新范围：预留多平台 publish 配置，本次只验收 macOS。
- 交互：启动登录后静默检查一次 + 后台下载，下载完成提示重启安装；同时提供手动检查入口。

**UI 方案（2026-08-06，用户确认）**：

- 入口：左下角账户菜单"个人信息"与分隔线之间新增"检查更新 v{当前版本号}"行（图标 + 版本号），
  点击立即手动检查；检查中该行显示加载态并禁用。
- 徽标：下载完成后账户触发器（用户菜单按钮）显示小圆点徽标提示有可安装更新；安装/已更新后消失。
- 状态文案（都在菜单行内，复用现有菜单行样式，不新增 Toast 体系）：
  检查中"正在检查更新…"；无更新"已是最新版本"（短暂显示后恢复）；发现新版本且下载中
  "发现新版本 vX.Y.Z，正在下载…" + 进度百分比；下载完成菜单行变为"重启并安装"（点击后
  安装并重启，可稍后再点）；失败"检查更新失败，点击重试"。
- 版本号由主进程 `app.getVersion()` 提供，打包与开发模式均一致；dev 模式（未打包）不启用
  真实自动更新逻辑，仅本地模拟验收时经 `dev-app-update.yml` 跑通下载链路。

**S4.5 Section G-1 完成记录（2026-08-07）**：

- **依赖与构建配置**：新增 `electron-updater@6.8.9`（dependencies，main 进程 externalizeDeps 需要
  运行时依赖）；`electron-builder.yml` 新增 `publish`（generic，默认 `http://127.0.0.1:8099`）、
  mac target 增加 `zip`（更新必需）、预留 `win/nsis` 与 `linux/AppImage` 配置；`package:mac`
  的 ad-hoc codesign 增加 `--options runtime --entitlements build/entitlements.mac.plist`
  （`com.apple.security.cs.disable-library-validation`，修复 hardened runtime 下框架加载失败）；
  新增 `dev-app-update.yml`（本地模拟验收时 electron-updater 在非打包模式要求该文件存在）。
- **主进程（职责单一拆分）**：
  - `update-state.ts`：纯状态机 `idle/checking/available/downloading/downloaded/error` +
    version/percent/message/currentVersion，`reduceUpdateState` 与 `isInstallable` 纯函数；
  - `electron-update-service.ts`：封装 UpdateDriver 接口（注入便于测试），init 时
    `setFeedURL`（`COOLTO_UPDATE_FEED_URL` 优先，默认本地地址）+ 事件接线，检查并发锁，
    `checkForUpdates(trigger)` 失败落入 error 相位并释放锁，`install()` → `quitAndInstall`；
  - `electron-updater-driver.ts`：CJS 默认导入（`import pkg from "electron-updater"`，Named
    import 在 ESM 下报 SyntaxError）+ `forceDevUpdateConfig` 用 getter/setter 代理到真实
    autoUpdater（初版误把标志写在自己包装对象上导致 dev 模式跳过检查，实测暴露并修复）；
  - `update-ipc.ts`：`updates:state/check/install` + main→renderer 推送 `updates:event`；
    `ipc.ts` 注册并组装 service（`forceDev = !app.isPackaged && COOLTO_UPDATE_DEV === "1"`）。
- **共享与 Renderer**：共享 `AppUpdateState/UpdateTrigger/UpdateStateEvent`；`DesktopApi.updates`
  （getState/check/install/onStateChange）+ preload + demo（idle 固定状态）+ unavailable api；
  `use-updates.ts` composable（订阅状态、手动检查后"已是最新版本"4 秒瞬态提示）+ `use-app-updates.ts`
  （挂载订阅、`watch(session.user)` 登录后静默检查一次、卸载清理，将 shell 压回 250 行内）；
  账户菜单整体提取为 `UserAccountMenu.vue`（主题/语言/个人信息/检查更新/退出登录，含更新行
  状态文案与触发器徽标，互斥开关状态收敛到 Sidebar 的 `openMenuId`），Sidebar 由 297 行回落
  至 243 行；i18n 新增 6 条中英文文案；徽标与更新行样式追加到既有 token/CSS。
- **验证证据（自动）**：新增 `test/update-state.test.ts` 11 个纯单测（初始状态、完整下载流、
  not-available 重置、进度 clamp、error 保留上下文、仅 downloaded 可安装、事件映射与订阅通知、
  错误相位、并发检查共享一次调用、失败释放锁、install 委托）；`npm run check` 全绿（400/400
  tests、578 个源文件 ≤250 行、模板快照、Node/preload/renderer 类型检查与两端构建通过），
  `git diff --check` 通过。本轮未 commit。
- **验证证据（实测，本地模拟验收）**：本地静态源服务器（`scripts/update-feed-server.mjs`，
  8099 端口）托管 electron-builder 生成的 `latest-mac.yml` + `Coolto-0.1.1-arm64-mac.zip`
  （+blockmap）；dev 模式 `COOLTO_UPDATE_DEV=1` + 同 `COOLTO_UPDATE_FEED_URL` 启动，经 CDP
  （`scripts/update-smoke.mjs`）驱动验证：
  - 登录会话恢复后静默检查自动触发（日志 `Checking for update` → `Found version 0.1.1`）；
  - 版本比较正确（0.1.0 → 0.1.1），后台下载完成（`New version 0.1.1 has been downloaded`，
    状态经 `checking → available → downloading(100%) → downloaded` 全链路推送 renderer）；
  - UI 状态机验证：下载完成相位账户触发器小圆点徽标出现（CDP DOM 断言 `badge: true`），
    菜单行"重启并安装"可用；dev 模式 Squirrel 原生安装对 `com.github.Electron` 无法定位更新
    bundle（zip 内是 `com.coolto.app`）属预期，状态如实落入 error，菜单行显示"检查更新失败，
    点击重试"，再次手动检查可恢复（`available → downloaded` 且复用缓存不重复下载）；
  - 账户菜单实际 DOM 行序验证：`["切换深色模式","切换到英文","个人信息","检查更新失败，点击重试","退出登录"]`。
- **环境限制与遗留项（如实记录，不隐瞒）**：
  1. **打包 app 在本机无法启动**：本机装有 eSafe MacSec DLP 安全代理（`/usr/local/MacSec/`，
     注入 `libesafenet.dylib`），打包版 `Coolto.app` 启动即
     `Fatal process out of memory: Failed to reserve virtual memory for CodeRange`（dev Electron
     不受影响，已验证非包体/签名/entitlements 问题：换 bundle id、清环境、`--jitless` 均复现）。
     因此"打包 v0.1.0 启动 → 重启安装后版本变 0.1.1"的物理安装验证在本机无法执行；
  2. 真实重启安装、签名（Developer ID）、公证与远端发布归 R1（用户确认"本地模拟验收先行"）；
  3. 多平台 publish 配置已预留但仅 macOS 链路实测。
- **状态**：S4.5 Section G-1 按完成门槛与本记录判定完成；Section H 由专职测试人员按既定标准
  验收（含 G-1 打包环境限制项）。

**S4.5 Section G-1 更新方式变更记录（2026-08-07，用户确认路径 A：electron-updater 检查下载 + 自研替换安装）**：

- **变更背景**：用户确认暂不购买 Developer ID 签名、以 GitHub Release/文件托管分发；由于
  electron-updater 在 macOS 上的 Squirrel 原生安装校验更新包签名（ad-hoc 无证书 anchor），
  应用内自动安装不可用，因此把最后一步替换为自研"解压替换 + 重启"。
- **职责变化**：electron-updater 降级为纯检查器（`autoDownload = false`，只做 latest-mac.yml
  解析、版本比较与 update-available 元数据产出）；下载（流式 + 进度 + SHA-512 比对
  latest-mac.yml 的 base64 摘要）、解压（`ditto -x -k`，保留 .app 符号链接/权限）、替换与
  重启全部自研；`install()` 从 `quitAndInstall` 改为自研替换执行器，不再触发 Squirrel。
- **新模块（均 ≤220 行）**：`update-downloader.ts`（zip 文件选择、相对/绝对 URL 拼接、流式
  下载与进度、SHA-512 校验失败删除残留）、`update-staging.ts`（下载 → 校验 → 解压 → 校验
  内含 .app bundle，任何失败整目录清理，fail-closed）、`update-installer.ts`（`locateAppBundle`
  exe 上溯、`buildReplaceScript` 生成替换脚本、`dispatchReplaceScript` detached 分离执行、
  `recoverPendingBackup` 启动自检恢复）。
- **替换时序（用户确认）**：点击"更新并安装" → 主进程校验 staging 完整性（失败进 error 相位
  不退出）→ 定位当前 .app → 写替换脚本（等旧进程退出 → 旧 app mv 备份 → 新 app mv 就位 →
  `open` 启动 → 清理）→ detached bash 分离执行（app 退出不终止）→ `app.quit()`；下次启动
  `checkPendingInstall` 发现备份残留（上次中断）→ 恢复旧版/清理，并提示"上次更新未完成"。
- **失败回滚与权限降级**：校验/下载/解压失败不动当前 app、可重试；替换先备份后替换，`mv`
  失败恢复备份；`/Applications` 无写权限时脚本失败，启动自检恢复后提示手动下载，一个会话一次。
- **状态机与 UI**：共享状态新增 `installing` 相位与 `errorStage: "check" | "install"`（错误
  文案区分"检查更新失败"与"更新失败"）；菜单行文案"重启并安装"→"更新并安装"、"正在更新…"、
  "更新失败，点击重试"；dev 模式 `install()` fail-closed（"开发模式不支持自动安装，请从发布页
  手动下载。"），不触碰任何真实 app。
- **验证证据（自动）**：新增/更新单测 26 个（服务事件映射、并发检查锁、下载失败/成功、dev
  install fail-closed、未下载 install 空操作、downloader 流式下载+进度+sha512 校验与不匹配
  清理、installer 脚本内容断言、**临时目录真实执行替换脚本**（成功替换 + 新包缺失时备份恢复
  两条路径）、备份扫描）；`npm run check` 全绿（415/415 tests、581 个源文件 ≤250 行、两端
  类型检查与构建通过），`git diff --check` 通过。本轮未 commit。
- **验证证据（实测，本地模拟验收）**：本地 feed 服务器 + dev 模式 CDP 驱动全链路：静默检查
  自动触发（日志 `Checking for update` → `Found version 0.1.1`）→ 自研下载 → SHA-512 通过 →
  `ditto` 解压 → staging 目录出现 `Coolto.app/Contents` 与 `update.zip` → 状态
  `downloaded`（percent 100，**不再出现 Squirrel 安装错误**）→ 账户菜单徽标出现 + 行文案
  "更新并安装" → dev 模式点击安装 → error 相位"开发模式不支持自动安装…"（errorStage install）
  → 菜单行显示"更新失败，点击重试"（阶段区分正确）。
- **遗留项（如实记录）**：打包环境真实"替换 → 重启 → 版本变更"仍受本机 eSafe MacSec DLP
  代理阻断（打包 app 无法启动，见 G-1 完成记录环境限制）；替换脚本逻辑已用临时目录完整执行
  验证（成功与回滚路径），真实 /Applications 场景由专职测试人员在正常环境按 Section H 复验；
  生产分发（GitHub Release 或对象存储直链 + README 下载说明）按用户路径 A 决策，发布流程归 R1。

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
- 性能目标只以每次真实用户命令从下发到合格预览交付的完整耗时 `≤ 600s`（2026-08-18 用户确认
  十分钟内可接受，覆盖 2026-08-05 的 240s 旧门槛）判定；不要求合成样本、
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

**S4.5 Section C 完成记录（2026-08-03）**：

- **前置复核**：开始前复读 AGENTS、正式 S4.5、用户确认、Section A–C 与上游 G1–G7；工作树最初无本节外
  改动，Section A/B 已有真实完成记录及本地 Docker 证据。本节按用户最新确认采用固定顺序，不实现旧方案中
  预留的手工拖拽或聊天重排。
- **开放而兼容的领域契约**：五种既有 `Experience.category` 不变；仅 `other` 可保存成对的
  `resumeSectionKey` / `resumeSectionLabel`，key 统一为小写 kebab-case（`^[a-z][a-z0-9-]{0,63}$`），label
  去首尾空白且限 1–120 个 Unicode 字符。缺一、空值、核心 category 携带自定义 section 与非法 key 均
  fail-closed；没有这对字段的历史 `other` 保持可读写并映射为 null，纯 section 元数据更新不制造正文 revision。
  后端 migration `00011_experience_resume_sections.sql` 以可空字段和对应 check 约束完成旧数据迁移。
- **声明式 registry 与固定编排**：`section-registry` 集中声明教育、工作/实习、项目、开放附加 section、技能五个
  区间；未知合法 key 走通用开放 section，不需要 central switch。核心区间保持既有类别顺序；附加 section 按最早
  `Experience.createdAt`（无该旧字段时稳定保留输入顺序）确定初次相对顺序，技能恒为最后。没有手工排序状态；
  空 section 不输出。
- **导入、同步与可追溯技能**：附件导入 schema、validation、Proposal、LocalSyncStore/Outbox、后端
  HTTP/OpenAPI/sync projection 与 Bootstrap/Pull 均携带规范字段，仍没有 Direct 写入。技能必须是显式
  `other + skills` 事实；tag 只在其确实出现于该经历正文时作为同源提示参与 NFKC、大小写无关的确定性去重，
  不会单独渲染为技能或根据 JD 编造。没有这样的 source fact 时不生成技能 section，也不阻断生成。
- **snapshot、EvidenceLedger 与降级**：source snapshot 保留 section 元数据和创建时间；附加/技能条目必须由
  带 quote/offset 的 evidence binding 生成 bullet。质量审查将 `other`/`skills` 的 `raw_text` 标为不可修复问题，
  renderer 同样 fail-closed，不能借 raw text 绕过 EvidenceLedger。空间溢出时只按固定删除优先级整段删除：先技能、
  再按 registry 顺序删除附加 section；教育、工作/实习、项目及已有 bullet 不截断、不伪造，内容不足允许留白。
- **验证证据**：新增专项覆盖论文、奖项、证书、研究、社团、显式技能、未知 section、旧 `other`、成对字段校验、
  tag 去重、无 evidence 拒绝、固定排序和空间降级；`npm run check:source-lines`（528 个业务源文件均 ≤250 行）和
  `npm run check` 全部通过（334/334 tests、Node/Renderer 类型检查及生产构建通过）。后端 `make check`、`make test`
  与 migration 状态均通过（仅保留未触及的既有 224/222 行目标提示）。本机 Docker API 在
  `http://127.0.0.1:8080` 重建后，health、携带 `research-papers`/`Research Papers` 的 sync create、bootstrap
  回读和同一测试资产的 expected-version 软删除均成功；没有回退线上或操作既有测试数据。
- **范围边界**：本节未开始 D–H；没有实现个人信息弹窗、教育视觉排版、三分钟性能优化或当前预览直接导出。

**S4.5 Section D 完成记录（2026-08-03）**：

- **入口与范围**：左下角账户更多菜单现按已确认顺序显示主题、语言、`个人信息`、退出登录；没有调整其他侧栏项、聊天、预览或生成工作区。个人信息只展示姓名、电话、简历联系邮箱、所在地、LinkedIn、GitHub、个人网站；未加入当前职位、公司或职业偏好字段。宽屏为居中弹窗，`≤820px` 与既有窄屏侧栏断点一致地切换为同内容近全屏布局。
- **写入与恢复**：读取 IPC 现在提供 Profile 本地 `clean/pending/conflict/failed` 同步状态，旧本地 projection 缺失 `contactEmail` 时明确映射为 `null`，不会阻断既有账号查看或补充资料。编辑先做必填/邮箱/HTTPS URL 字段校验；保存仅先创建既有不可变 Proposal，确认后才写 Outbox。pending 继续显示排队状态；conflict/failed 在弹窗内可见，并分别复用 Section B 的 reapply 和 accept-server Proposal，不建立 Direct 写入或第二套同步机制。
- **无障碍与本地化**：弹窗使用 `dialog` / `aria-modal`、关联标题/说明与字段错误、焦点陷阱；打开时焦点进入关闭/编辑流程，编辑校验失败时移至第一个错误字段，Esc 关闭后回到账户更多触发器。所有新增文本已接入中英文；深浅主题仅使用现有 token。真实 Electron 验收中临时切换语言和主题后均已恢复原浅色中文设置。
- **验证证据**：新增 `test/profile-form.test.ts`、`test/profile-dialog-controller.test.ts`，并扩展 Profile Proposal/locale 测试，覆盖必填/选填/URL、旧 projection、Proposal 零写入、pending、conflict、failed/reapply 与中英文。专项 11/11 通过；`npm run check` 通过（339/339 tests、532 个业务源文件均 ≤250 行、Node/Renderer 类型检查和两端构建通过）；`git diff --check` 通过。生产构建 Electron 以本地 Docker 既有登录会话复核入口、查看/编辑、字段校验、Proposal 审阅后取消、Esc、焦点进入/返回、ARIA、深浅主题、中英文、窄屏与 200% 缩放无横向溢出；未确认 Proposal，未写入或修改用户资料。截图证据：`s4.5-section-d-profile-wide.png`、`s4.5-section-d-profile-narrow.png`（同目录）。
- **范围边界**：Section D 到此完成；未开始 E–H，也未执行任何生成、模板、性能或直接导出改动。本轮未 commit、未 push。

**S4.5 Section E 完成记录（2026-08-03）**：

- **同源字段映射**：`ResumeContact` 与候选骨架现完整投影 GitHub、个人网站；姓名、电话、简历联系邮箱继续由
  Section B 的 source snapshot 前置门强制要求。共享的 section presenter 只解释字段，不复制 HTML：教育固定为
  “学位/专业 + 日期”第一行、“学校/学院 + 地点”第二行；工作/实习和项目仍使用原有 `title + organization`、
  `role + location` 两行组合。所在地、LinkedIn、GitHub 和个人网站只在已确认非空值时输出；极长 URL 使用
  既有 contact token 换行，不产生横向溢出。
- **顺序与 PDF 完整性**：同一 presenter 保持教育、工作/实习、项目、附加 section、技能的稳定顺序，技能始终
  为最后一个业务 section，空技能不输出。右侧 A4 预览、可编辑预览和隐藏 Chromium 仍全部调用同一个
  `renderResume`；PDF postflight 现同时校验所有实际渲染的联系字段，避免预览/PDF 出现字段漂移。
- **结构、截图与页面渲染回归**：新增 Section E 结构快照，锁定教育行映射、工作/项目原有行模型、缺失选填、
  全部联系字段、极长 URL 以及附加 section → 最后技能的顺序。`qa:resume-renderer` 新增极长联系字段和附加
  section/多技能的一页 fixtures，生成 Chromium A4 `qualified.png`、同源 `qualified.pdf` 与由 PDF 首页渲染的
  `qualified-pdf-page.png`；QA 输出目录为系统临时 artifact 目录，运行结果会回显精确路径。人工复核这些输出与
  用户提供的两张问题截图：教育现为所需的两行层级；工作/项目的字体、间距、粗细和换行规则由结构快照锁定，
  仅因前置内容自然发生纵向推移。
- **验证证据**：真实 Electron Chromium/PDF QA 通过：中文合格 fixture 页面占用率 `91.71%`、最低尾行
  `67.65%`、20 条 evidence bindings；中英文、混排、缺失选填、极长 URL、附加 section、多技能、Markdown、
  underfilled、tail failure、overflow、并发编译、A4 PDF、PDF postflight 和 G6 既有导出 QA 均通过。
  `npm run check` 通过（344/344 tests、534 个业务源文件均 ≤250 行、模板同步、Node/Renderer 类型检查和两端
  构建通过），`git diff --check` 通过。
- **范围边界**：本节未修改生成性能、模型轮次、计时、导出 IPC 或直接导出流程；Section E 到此完成，F–H
  尚未开始。本轮未 commit、未 push。

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

### S5 生产 LLM 网关真实接线记录（2026-08-11）

- Desktop Agent 保留既有 DeepSeek/OpenAI-compatible 消息、工具和 SSE 解析，通过
  `COOLTO_LLM_GATEWAY_BASE_URL` 将模型请求改发到 Credit API；每次调用复用当前主站
  `access_token` Session，并自动附加合法 `operation_type` 和唯一 `request_id`。New API
  内部 Token 和 DeepSeek Key 均不进入生产 APP、仓库或普通日志。主 Agent、CLI、性能验收及
  简历并行写作共用同一网关依赖；仅未配置网关的本地直连开发回退需要 `DEEPSEEK_API_KEY`。
- 新增只读 `auth.getCredits()` IPC，用同一 APP Session 调用 `GET /api/user/credits`，严格解析
  Credit 契约；当前仅用于验收和后续额度展示接线，未改变现有 UI。
- 真实 Electron + 生产账号验收：APP 指向 `https://hkapi.coolto.com.cn` 与
  `https://credit.coolto.com.cn`，发送“不要调用工具、只回复固定文本”的单轮提示后约 1 秒显示
  `COOLTO_APP_GATEWAY_OK`。随后只读余额为 weekly `5`、credit `15`，最近流水为
  `WEEKLY_FREE_USAGE -5`（`2026-08-11T09:01:19.001223Z`），并保留同账号首次惰性创建的
  weekly `+10` 与 trial `+15`；证明本次 `match_analyze` 只结算一次且优先消耗周免费额度。
- 验证：网关-only 配置、网关 base URL/metadata、Session 复用、Credit 契约和简历规划相关测试
  共 13/13 通过；Node 与
  Renderer 类型检查、588 文件行数门禁、Electron production build 通过。`npm run check`
  在进入测试阶段前的模板、行数和两端类型检查均通过，418 项测试中 414 通过；4 项既有
  macOS 路径/`/bin/bash` 测试在 Windows 失败，导致全量命令未继续执行末尾 build，已另行执行
  `desktop:build` 成功，本次改动相关测试无失败。
- 当前验收环境显式使用 `COOLTO_LLM_OPERATION_TYPE=match_analyze`。正式覆盖 JD 解析、简历生成、
  自我介绍等业务入口前，仍需把每个顶层用户操作映射到对应 operation type，避免所有 Agent
  轮次都按匹配分析定价；本记录不将该后续映射误标为完成。

### 额度展示与购买接线（2026-08-14，S5 前置接线）

- 后端（cv-agent-api-service）新增 `GET /api/plans`（套餐目录：plan_type/price_cny 整数分/
  credits/valid_days，不暴露爱发电内部 plan/sku id，未配置套餐过滤）与 402
  `insufficient_credits` 明细（error.detail = {total, weekly_free, credit_balance, estimated}，
  由 LLM 网关 Meter.CheckAndMark 拆分返回）；后端单测/vet 通过（postgres integration 因主站
  库未启动跳过，为既有环境依赖）。
- APP 新增 3 条 IPC 通道：`checkout:plans/create/verify`（checkout-api-client 走
  llmGatewayBaseUrl + 主站 Session Cookie）与 `shell:open-external`（仅放行 http(s)，供系统
  浏览器打开爱发电付款页，PRD D2 明确不用内置浏览器）。
- 余额不足拦截：pi-ai 将网关 402 折叠为 `"402: {json}"` 错误串，main 进程
  `insufficient-credits-detect.ts` 解析出 error.code/detail，经 `agent:event` 推
  `agent.insufficient-credits`（含余额明细），renderer 弹余额不足窗；聊天错误消息照常展示。
- UI（按已确认方案实现）：`CreditDialog`（余额卡：周免费/付费分列+过期+构成条；套餐卡 ×2 始终
  可购买；购买状态机 opening→waiting 轮询 3s×10→success/timeout→「检查支付结果」verify，
  checkout_id 存 localStorage 供重启后查单）、`InsufficientCreditsDialog`（PRD D4 文案）、
  侧栏账户区余额 chip + 用户菜单「Credit 与套餐」入口；全部复用现有 dialog 模式、tokens.css
  与 primary/secondary 按钮，样式文件在 base.css @import 链登记。
- 验证：Node 与 Renderer 两端类型检查通过、`npm run build` 与 `desktop:build` 通过；
  `check:source-lines` 新增/改动文件全部合规（仅存 4 项既有违规：cli/main.ts、agent-runtime.ts、
  ipc.ts、bullet-validator.ts，其中 ipc.ts 为基线 291 行+本接线 9 行净增）；`npm run test`
  4 项既有 macOS/`/bin/bash` 测试失败（与 2026-08-11 记录一致，git stash 基线复现验证与本
  改动无关）。
- 遗留项：真实 Electron + 生产账号的购买 E2E（套餐页拉取 /api/plans、浏览器付款、回程轮询
  到账、超时手动 verify）需在爱发电真实 plan_id/sku_id 就绪后执行；周付/月付套餐名与操作定价
  前端文案（周付/月付标签）暂为常量，后端 plans 接口就绪后以接口数据为准。

**额度弹窗信息层级重构记录（2026-08-14，用户确认）**：

- **信息布局**：`CreditDialog` 改为固定标题栏和独立可滚动内容区，内容区直接复用既有
  `conversation-scroll` 的 5px 悬停滚动条。余额概览使用 `--surface` 底色且无边框，周免费与付费余额
  用两列指标、到期日期与进度条呈现；“最近流水”已从弹窗移除，既有接口流水字段保留但不再渲染。
  最新调整中，“可用余额”与余额值合并为同一行，并缩小了概览区的内外间距。
- **套餐主次**：两张套餐卡均保持透明底与边框，均统一为 UI 字体、14px 套餐名与 22px 价格；月付仅以
  正文色强边框和 primary 按钮作为主推强调，周付保留标准边框与 secondary 按钮。“推荐”和“更划算”
  已收为月付卡片右上角的 10px 小标签，卡片移除了重复说明并压缩纵向间距。未新增硬编码颜色或第二套主题，
  窄窗保持单列降级。
- **数据契约修复**：`checkout-api-client` 现在在主进程边界校验并映射 `/api/plans` 的
  `plan_type` / `price_cny` / `valid_days` 蛇形字段，拒绝缺失、类型错误或非法套餐，修复前端读取
  `priceCny` / `validDays` 所致的 `¥NaN` 与空有效期；`/api/checkout` 的 `checkout_id` / `afdian_url`
  也会被校验并转换为前端字段，且仅允许 http(s) 付款链接，修复系统浏览器收到空链接的失败路径；新增有效与
  无效契约回归测试。
- **自动验证**：`npm.cmd run typecheck`、`npm.cmd run desktop:typecheck`、`npm.cmd run build` 与
  `npm.cmd run desktop:build` 通过；新增 checkout 契约测试通过。`npm.cmd run test` 为 458/462 通过，
  4 项 macOS `/bin/bash` / POSIX 路径基线失败与本次无关；`check:source-lines` 仅剩
  `cli/main.ts`、`agent-runtime.ts`、`ipc.ts`、`bullet-validator.ts` 四个既有超限文件，本次文件均
  不超过 220 行目标和 250 行硬限制；`git diff --check` 通过。
- **未完成的可见验收**：已启动本地 Electron 开发窗口，但 Windows 自动截图辅助工具两次因
  `SetIsBorderRequired` 接口错误无法捕获窗口，故不将其视为真实视觉验收。仍需在可用 Electron
  环境手动确认宽/窄窗口、深浅主题、200% 缩放、键盘焦点和真实套餐返回值；购买 E2E 继续按上方
  既有遗留项执行。当前 Credit API 仅返回剩余 `weekly_free_credits` 和 `credit_balance`，没有初始总额度
  或已用额度，因此无法正确计算“已用越多、进度越高，0 时为 100%”的连续百分比；待用户确认临时口径或
  后端补充字段后再完成该进度条语义。本轮未 commit、未 push。

**发布前安全审计与全量门禁修复记录（2026-08-14，用户确认）**：

- **生产依赖漏洞清零**：将 `dompurify` 升至 `3.4.13`、`pdfjs-dist` 升至 `6.2.108`，并更新锁文件中的
  `js-yaml 4.3.1`、`nanoid 3.3.18` 与 `postcss 8.5.26`；修复审计发现的 3 项 High 和 2 项 Moderate
  漏洞。使用 npm 官方 registry 复核 `npm audit --omit=dev --audit-level=high`，结果为
  `found 0 vulnerabilities`。
- **模板锁恢复一致**：保留 2026-08-13 已提交的简历质量门槛（尾行 `gate_ratio=0.7`、最大密度
  `0.98`），把 `source-lock.json` 的哈希和大小更新到当前模板；未回退质量要求。
  `check:resume-template` 已恢复通过。
- **跨平台测试修复**：原子 PDF 写入测试不再硬编码 `/tmp`，改为按宿主路径规则验证同目录临时文件、
  rename 与失败清理；macOS App Bundle 定位显式使用 POSIX 路径。两项真正调用 `/bin/bash` 的替换脚本
  集成测试在 Windows 明确 skip，在具备 Bash 的平台继续执行，避免把“命令不存在”误当作恢复成功。
- **250 行硬门禁恢复**：按职责拆分既有 4 个超限文件，公开入口和业务顺序不变：CLI 单次生成驱动移至
  `one-shot.ts`（`main.ts` 358→193 行）；Agent 提示执行移至 `agent-runtime-prompt.ts`
  （`agent-runtime.ts` 321→232 行）；会话/附件/Agent/窗口 IPC 移至 `conversation-agent-ipc.ts`
  （`ipc.ts` 300→193 行）；数字证据补齐移至 `bullet-number-coverage.ts`
  （`bullet-validator.ts` 260→205 行）。
- **完整验证**：`npm run check` 全绿——模板锁通过、613 个业务源文件全部 `≤250` 行、Node 与 Renderer
  类型检查通过、462 项测试中 460 通过/0 失败/2 项 Windows 平台 skip、Node build 与 Electron
  production build 通过；`git diff --check` 通过。两项 Bash 替换脚本集成测试仍需在 macOS 发布机执行，
  本记录不把 Windows skip 记为跨平台实测完成。本轮未 commit、未 push。
- **桌面发行加固与兼容修复**：首版生产 Main 使用 V8 bytecode；同一 NSIS 包在构建机安装前后 EXE、ASAR
  和原生模块哈希完全一致且可启动，但用户另一台 Intel/AMD x64 Windows 明确报
  `cachedDataRejected`，证明该 cache 不具备本产品所需的跨机器发行兼容性，不能继续作为通用壳。`0.1.1`
  移除 `.cjsc` 后又在用户本机暴露 `ERR_PACKAGE_PATH_NOT_EXPORTED`：构建器把只支持 ESM import 的
  `pi-ai`/`pi-agent-core` 留成了 CommonJS `require()`；旧安装冒烟测试只检查进程存活，把仍停留在 Electron
  错误对话框的进程误判为成功。`0.1.2` 将这两个依赖及动态块合并进单一 Main，再以每次 release 随机生成的
  256-bit 密钥做 AES-256-GCM 认证加密，并把密钥只编入当轮 Rust 模块；ASAR 仅保留 853,561-byte 密文和
  1,097-byte loader；Rust 不导出明文解密接口，而是在原生模块内完成认证解密并直接交给 V8 执行。
  Preload 继续保持 sandbox，只压缩且不生成 source map；Renderer 同样压缩且不携带产品 TypeScript/Vue/
  source map。Electron 的 ASAR 完整性、OnlyLoadAppFromAsar、Cookie 加密、RunAsNode/`NODE_OPTIONS`/CLI
  inspect 封锁全部保留，Browser-specific V8 snapshot Fuse 继续关闭。
- **原生核心与篡改阻断**：新增 Rust/NAPI release 核心，将简历综合质量权重和 bullet 相似度算法移出
  JavaScript，并承担 Main 认证解密；release 使用 fat LTO、单 codegen unit、`opt-level=3`、panic abort 与
  符号剥离。loader 启动时先校验 `.node` SHA-256，再调用原生解密；原生文件缺失/替换、接口错误、密文
  header 错误、认证标签不一致均 fail-closed。Rust 3 项测试通过，包括正确密文解密和单字节篡改拒绝，
  质量权重/相似度导出结果继续通过。最终 Windows x64 原生模块为 262,144 bytes，发布审计强制要求存在
  `runProtectedMain` 且禁止重新暴露 `decryptProtectedMain`。
- **Windows x64 发行证据**：修复后的 `Coolto-0.1.2-x64.exe` 为 136,002,609 bytes，SHA-256
  `5CC790085FE3620165EBFDA789D7FA3D62C4CFCE071B3DCE43FC98475288ABF9`；ASAR 反向清单确认没有产品
  TypeScript/Vue/source map 或 `.cjsc`，并对完整 `app.asar` 扫描确认两项受保护提示词 marker 均不可检出。
  Fuse wire、密文 header/大小、loader 大小和原生模块均通过自动门禁；门禁还会拒绝 Main 目录出现任何未加密
  的额外代码块，并在加密前拒绝 import-only 依赖残留为 `require()`。隔离 NSIS 验收现要求收到 Rust 解密后的
  Main 同步启动完成标记，并继续保持 Renderer 正常运行，不再以“进程未退出”代替成功；安装副本通过后再精确
  终止、静默卸载并确认测试目录清理。npm 官方 registry 复核生产依赖仍为 `found 0 vulnerabilities`；最终
  `npm run check` 全绿：615 个业务源文件均 `≤250` 行，462 项测试 460 通过/0 失败/2 项 Windows skip。
  加固架构、固定打包顺序、密钥生命周期、跨平台门禁、两次失败根因和 Agent 交付清单已整理到
  `local-docs/desktop-release-hardening-runbook.md`，并由根目录 `AGENTS.md` 设为后续发布任务的必读入口。
- **macOS Universal 与发行遗留**：Main 改为平台无关的同一认证密文；Apple Silicon 构建链分别编译
  arm64/x64 Rust 模块后以 `lipo` 合并，electron-builder 目标保持 Universal，并使用
  手动 `macos-26` GitHub Actions，对 APP 主程序、原生模块双架构及 ad-hoc codesign 做强制校验。当前
  Windows 无法可信执行 macOS `lipo`、DMG 和签名验证，因此该产物必须在工作流真实通过后
  才记为完成。Windows 安装器 Authenticode 实测为 `NotSigned`，macOS 仍为 ad-hoc、未 notarize，不能据此
  承诺无 SmartScreen/Gatekeeper 提醒；自动更新源仍为 `http://127.0.0.1:8099`，须在用户提供准确 HTTPS
  发布基础地址后重打最终分发包。本轮只完成本地 Windows 测试发行，未上传产物。

- 当前严格按 A0 → J0 → J1 → J2 → J3 → E0 → E1 → E2 → E3 → E4 → E5 → E6 → S4
  → BE0（已完成）→ BE1（已完成）→ BE2（已完成）→ BE3（已完成）→ BE4（已完成）→ BE5（当前）→ BE6 → BE7 → BE8
  → S4.5 → S5 → R1 推进；2026-08-23 用户明确覆盖此前先回 S4.5 的顺序；
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

#### 修复记录：简历生成两个稳定性问题（2026-08-16，用户报告后根因修复）

**问题 1：经历多时出现"输入超过操作上限"报错（服务端 413 prompt_too_large）**

- 根因链：经历多 → `get_resume_source_snapshot` 载荷大 → 模型请求体超过服务端
  `max_prompt_tokens=32000`（约 192KB 字节闸，`request_policy.go`）→ 413 envelope
  message 被 `desktopErrorMessage` 原样展示。两个放大因素：
  1. `evidence-candidates.ts` 的 `slice(0, Math.max(48, balanced.length))` 在经历多时
     完全不截断证据候选（本意是封顶 48，写成取最大值）；
  2. 本地上下文压缩阈值 200k tokens 是服务端 32k 上限的 6 倍，压缩永远在 413 之后才
     触发，且压缩后保留的最近 60k tokens 尾巴仍超预算。
- 修复（3 处，行为修复不动 UI）：
  1. `evidence-candidates.ts`：候选封顶固定 48（`slice(0, MAX_AVAILABLE_EVIDENCE)`，
     balanced 优先保证每条经历至少 1 条）；
  2. `context-compaction.ts`：`DEFAULT_COMPACTION_THRESHOLD_TOKENS` 200k→24k、
     `KEEP_RECENT_TOKENS` 60k→16k（对齐服务端预算，压缩后摘要+尾巴+系统提示仍低于 32k）；
  3. `resume-continuation.ts`：新增 `isPromptLimitFailure` 守卫——续接循环检测到
     prompt 超限类错误（413/输入超过操作上限/context length 等）立即归一
     `needs_user_decision`，不再带更大的上下文重试。

**问题 2：经历少时陷入长时间 thinking 空转（用户感知"无限思考卡死"）**

- 根因链：经历少 → availableEvidence 不足 → 占用率达不到 85% → workspace 停在
  writing → 续接循环持续注入"继续写"指令 → 模型无素材可写进入 thinking 打转。现有
  守卫被系统性绕过：
  1. `assistantOutputSignature` 序列化整个 content，thinking 文本每轮必然不同 →
     identical 守卫永不触发；
  2. 生产续接预算 `UNLIMITED_CONTINUATION_BUDGET.maxMs=∞` 无墙钟兜底（300 轮 ×
     20-60s ≈ 1.7-5 小时）；
  3. 两处 `while (agent.isRunning)` 死等无超时（abort 后流未收尾即永久卡死）；
  4. 初始 turn 软限 10 分钟过长且无进展守卫。
- 修复（5 处）：
  1. `continuation-output-signature.ts`：`assistantOutputSignature` 指纹排除 thinking
     文本（只保留 `{type:"thinking"}` 标记）→ 纯思考复读可被 identical 守卫抓住；
  2. `resume-continuation.ts`：`UNLIMITED_CONTINUATION_BUDGET.maxMs` ∞→900s（15
     分钟墙钟，正常生成 ≤240s+续接远小于此；CLI `--no-timeout` 显式覆盖 maxMs 不受
     影响）；
  3. 新增 thinking-only 空转守卫（`isThinkingOnlyMessage` + `MAX_THINKING_ONLY_ROUNDS=3`，
     连续 3 轮无文本无工具调用即归一终止；无 assistant 消息返回 undefined 不计数，
     避免误伤）；
  4. 两处 `while (isRunning)` 死等改为 `waitForAgentIdle(agent, 30s)`（带超时，超时后
     走错误路径结束而非永久卡死）；
  5. `INITIAL_TURN_MAX_MS` 600s→360s（初始回合软限缩短，超限转入带全套守卫的续跑，
     不丢工作）。
- 验证：`npm run test` 488 tests 通过（新增 4 用例：thinking-only 守卫、prompt-limit
  立即终止、指纹排除 thinking、证据候选封顶 48）；`check:source-lines` 626 文件全过；
  `npm run typecheck` 与 `npm run desktop:typecheck` 通过。`npm run build` /
  `desktop:build` 未执行（用户指示先不发版）；真实 Electron 验收与发版归入后续。

**追加：素材耗尽时引导用户新增经历（2026-08-16，用户要求"证据少时引导新增经历，证据多时正常生成"）**

- 思路：不做"生成前预检拒绝"（理论估算会误伤 3 行 bullet 可达标的样本），而是把
  "素材耗尽"作为宿主侧的确定性早停信号 + 明确引导：
  1. `diagnostics-projection.ts` 新增 `unusedEvidenceTotal(workspace)`（复用
     `rankAvailableEvidence` 计算未消费证据数）与 `EVIDENCE_EXHAUSTED_THRESHOLD=2`；
     `instructionFor` 的 `needs_user_decision` 分支按素材是否耗尽分流：耗尽时文案
     明确"当前所选经历的素材不足…请引导用户补充经历（在经历库新增与目标岗位相关的
     经历：具体项目、量化成果、技术栈），然后重新生成；或放宽匹配条件重选经历"，并
     保留"不得降低质量门槛、不得编造证据"与占位符数字说明；素材充足时维持原文案。
  2. `resume-continuation.ts`：stalled 守卫阈值动态化——未消费证据 ≤2 时
     `MAX_STALLED_ROUNDS` 6→`MAX_STALLED_ROUNDS_EXHAUSTED=2`（素材耗尽时 2 轮
     无实质进展即归一，快速交还用户；素材充足时行为不变，证据多正常生成）。
- 效果：经历少 → 模型写完可用证据 → 素材耗尽 → 2 轮内收敛到 `needs_user_decision`
  → 最终回复明确引导用户新增经历（而不是空转 6-8 轮甚至 15 分钟墙钟）；经历多 →
  一切照旧，由 `rankAvailableEvidence` 从充足素材中选最合适的。
- 验证：`npm run test` 491 tests 通过（新增 3 用例：素材耗尽 stalled 提前收敛、
  instruction 耗尽引导文案、instruction 素材充足时维持原文案；既有 budget 用例改为
  保留未消费素材以继续验证 model-call 兜底路径）；`check:source-lines` 626 文件全过、
  `npm run typecheck` 通过。build 系列仍按用户指示未执行。

**本地打包验证（2026-08-16，用户要求"本地打个包试试"，未发版）**：

- 完整命令：`npm run check` 全绿（含 build / desktop:build）→ `npm run package:win`
  （native:build:win → desktop:build:protected → electron-builder --win nsis --x64 →
  verify:release:win → verify:installer:win），exit 0。
- release 审计：ASAR 19,543 文件，Main loader 1,097 bytes + 密文 872,928 bytes
  （`CLTOENC1` 加密），原生模块 262,144 bytes，Electron Fuses verified。
- 安装器真实验收：静默安装到隔离目录 → 哈希一致 → `COOLTO_MAIN_BOOTSTRAP_READY`
  真实 bootstrap → Renderer 保持健康 → 精确终止进程树并静默卸载清理，通过。
- 产物：`dist-electron/Coolto-0.1.18-x64.exe`，136,502,866 bytes，SHA-256
  `46fc985ff7f3681b16669aafdc9840f8eb635d818ff9c54231b660c7fd4598aa`；
  Authenticode `NotSigned`（Windows 无签名配置）；更新源仍为 localhost；
  本机为本地测试构建，未上传、未 commit、未 push。

**实测卡死与第二轮修复（2026-08-16 晚，用户装 0.1.18 实测仍卡死，服务器日志取证）**：

- 实测现象：用户生成简历时"循环卡死，一直说不对"。服务器（网关 + new-api）日志取证：
  同一会话连续 19+ 轮 `/api/llm/chat/completions`（23:08-23:17），prompt_tokens 从
  28K 涨到 47K（每轮 append，临近 413 字节闸）；大部分轮 completion 仅 50-2400
  （短输出 = "不对"式短文本轮）；每几轮一次 completion=16384 满额截断（stopReason=
  length，单轮 65-69s）——**"自我否定 + 重试"循环，短文本轮与截断轮交替，绕过了
  第一轮的全部守卫**（thinking-only 需连续 3 轮、identical 需输出相同、stalled 需
  指标不变）。且大部分轮发生在初始回合（无续接守卫，只有 repetitionGuard + 360s
  软限），19 轮约 5 分钟才被软限掐断，随后续接守卫同样失明。
- 第二轮修复（3 个宿主硬守卫，不依赖模型遵守文本指令）：
  1. `agent-runtime-prompt.ts`：初始回合新增"连续工具失败"守卫——订阅
     `tool.completed`，连续 8 次失败（成功重置）立即 cancel 转入带守卫的续跑，
     不再让模型空转到软限（`MAX_INITIAL_TOOL_FAILURES=8`）；
  2. `resume-continuation.ts`：相同工具结果硬停止——既有 `sameOutcomeRounds`
     从"仅注入文本反馈"升级为硬守卫：连续 4 次相同结果（成败+摘要一致）宿主直接
     归一 `needs_user_decision`（`MAX_SAME_OUTCOME_ROUNDS=4`）；
  3. 输出截断守卫——连续 2 轮 assistant `stopReason=length`（max_tokens 掐断，
     工具参数可能不完整，重试只会再截断）直接归一（`MAX_TRUNCATED_OUTPUT_ROUNDS=2`，
     `isTruncatedOutputMessage`）。
- 验证：`npm run test` 491 tests 通过（新增 truncated 硬停止、same-outcome 硬停止
  2 用例）；`check:source-lines` 626 文件、双 typecheck 通过。`package:win` 全链路
  （release 审计：loader 1097B + 密文 873,307B；安装器真实 bootstrap + 卸载）通过。
- 产物：`dist-electron/Coolto-0.1.18-x64.exe`，136,489,492 bytes，SHA-256
  `82d48db6a01e2d77e301d328c73509da1be977ef4053ef23067a3d481f2e070e`；
  Authenticode NotSigned；未上传、未 commit。

**根因修复追加（2026-08-17，单一通用 Agent / 无宿主简历模式）**：

- 边界：保留一个由自然语言自主选工具的 Agent；未新增简历模式、宿主固定工作流或按意图
  路由。宿主只执行任务无关的运行时治理，领域工具只报告真实状态。
- 内部 turn 治理：确认外层 continuation 守卫看不到一次 `agent.prompt()` 内部的工具循环；
  通过 `pi-agent-core` 已存在的 `shouldStopAfterTurn` 底层钩子接入 `turn-governor.ts`，
  连续 3 轮相同工具结果、连续错误结果、上下文终止错误或单 run 40 turn 安全上限均在下一次
  模型调用前结束。0.81.1 的 `Agent` 包装层未透传该钩子，新增严格锁定版本、精确替换且幂等的
  `scripts/patch-pi-agent-stop-hook.mjs` 安装后兼容脚本；未升级依赖、未引入额外包。
- 可达终态：`workspace-status.ts` 在页面仅欠填、所有经历已写且未消费证据为 0 时返回
  `needs_user_decision`；`writePlan` 按剩余证据容量计算可行 bullet 数，不再报告物理上无法
  完成的静态缺口；terminal Workspace 拒绝后续 patch。模型载荷同时返回
  `continuation={continuable:false,reason:evidence_exhausted}`。
- 工具结果去歧义：每次候选 patch 明确返回 `success/partial_success`、`attempted`、
  `applied`、`rejected` 和 `repairs`；干净 patch 会覆盖旧 report，避免模型把历史拒绝继续
  当作当前失败，也避免把部分成功口头总结为全部成功。
- 上下文治理：`search_experiences` 给模型的列表结果移除 `currentRevision.content`（完整正文
  仍保留在 tool details，并由 `get_experience` 按需读取）；候选 Workspace 建立后，旧的
  JD/Experience 搜索、详情、布局检查和 snapshot 结果统一替换为压缩占位，仅保留最新完整
  Workspace。服务端实测的 `error: terminated + output=16384` 也归类为输出预算截断。
- 服务端边界：本轮未擅自修改 `cv-agent-api-service` 的 `max_prompt_tokens=32000`。该值同时
  参与 Credit 预留额度；线上上游实际接受 47K prompt，直接提高额度会增加预留并可能改变
  `insufficient_credits` 行为，直接把字节估算改得更严格又会更早拒绝，需作为计费策略单独确认。
- 验证：新增/更新内部 turn、搜索载荷、上下文替换、部分成功、证据耗尽终态、terminal patch
  与 16384 terminated 截断用例；`npm run check` 全绿（627 个源文件全部 ≤250 行；Node 与
  Desktop 双 typecheck；496 tests 中 494 pass、2 个平台条件 skip、0 fail；Node build 与
  Electron renderer/main/preload build 均成功）。未执行真实模型性能复测、未打包、未上传、
  未 commit、未 push。

**Credit 动态输出预算追加（2026-08-17，用户确认输入 64K、输出无固定产品上限）：**

- App 删除 `create-agent.ts` 的 `maxTokens: 16384` 固定覆盖；pi-ai 继续按模型声明的物理
  ceiling 生成本次请求额度，Credit 网关再按本次 prompt 与剩余 Credit 动态收窄，不新增
  业务模式、意图路由或宿主固定编排；
- 通用 turn governor 将 `insufficient_credits` / `credit_exhausted` / 402 识别为不可重试
  模型终态；简历 continuation 同样在首个 Credit 错误后归一为 `needs_user_decision`，不会
  再自动发起消耗额度的请求；
- `cv-agent-api-service` 同步实现 64,000 Token 输入门禁、原子范围预留与动态
  `max_tokens` 反算，移除 per-operation 固定输出字段；PR #27 主改动、PR #28 gofmt 修复与
  PR #29 64K usage-check fixture 修复均已合入。正式流水线 #65 的 Validate、全仓 race tests、
  精确 SHA 部署、New API 内部 readiness 与公网 Credit readiness 全部通过；生产复核 HEAD 为
  `90ec9c357ab674fb825c106ab656ce50ae950198`，工作树干净、API running、units 模式与 8 个
  64K 输入限制生效，无固定 `max_completion_tokens`，近 10 分钟无 API error/fatal/panic；
- App `npm run check` 全绿：627 个源文件全部 ≤250 行；Node/Renderer 双 typecheck；
  497 tests 中 495 pass、2 个平台条件 skip、0 fail；Node build 与 Electron
  main/preload/renderer production build 均成功。`npm run package:win` 亦完整通过：原生 Rust
  3/3 测试、protected build、NSIS x64、ASAR/原生模块/Fuses 加固审计及安装器真实安装、
  bootstrap 健康与卸载门禁全部成功。产物 `Coolto-0.1.18-x64.exe` 为 136,485,033 bytes，
  SHA-256 `78fda8cc96919ab534ab211dd0a161a25c2ffb64fec1a77fd748296de462febf`；按用户要求仅本地
  打包，App 未上传、未 commit、未 push、未发版。

#### S4.5 简历生成稳定性统一 Roadmap（2026-08-17，本次完整对话落档）

> **v8 实测后的当前实施方向（2026-08-17，覆盖下方旧阶段机记录）：**已完成 R1——
> 删除宿主 resume continuation/phase prompt 外循环，一次用户消息只调用一次 pi-agent-core
> `prompt()`；只读工具可并行、变更工具强制串行；上下文阈值改由 DeepSeek 1M 模型物理
> 能力与网关能力动态推导，不再固定 24K。完整测试 500 项中 498 pass、2 skip、0 fail；
> 后续按 `S4.5.1-phase-driven-resume-generation.md` 的新 R2–R5 基线继续；当前 R1–R5 代码与自动化质检已完成，仍未做本轮真实 Electron 自然语言验收或生产部署。

> **R2 批量工作区工具完成（2026-08-17）：**Agent 简历生成工具面已收敛为
> `create_resume_workspace / get_resume_workspace / apply_resume_content`；删除旧的 snapshot、
> layout estimate、plan、逐 bullet writer、inspect、patch 以及 Agent save/export 工具。
> 创建阶段不再预测素材可达性；批量 apply 对多个完整 item 只编译一次，并返回与 revision
> 对齐的真实 px 测量。双 typecheck 与完整测试通过（479 pass、2 skip、0 fail）。

> **R3–R4 补充材料、确认与宿主持久化完成（2026-08-17）：**新增
> `add_resume_material / prepare_experience_sync`；用户补充保持原始快照不可变，AI 补写
> 必须经程序确认，经历库同步确认前不落库。保存与导出均移出 Agent，宿主按钮共享 revision、
> 真实版面、bullet 数量、证据、标点与补写确认门禁；本地草稿自动保存，并在未保存/保存失败
> 退出时提供保存、保留上次草稿、取消三种选择。完整回归 487 tests 中 485 pass、2 skip、
> 0 fail；Node/Desktop typecheck 与 636 文件行数门禁通过。

> **R5 模型能力与全链路质检完成（2026-08-18，未部署）：**Credit API 以类型化
> `contextWindow=1,000,000 / maxOutput=384,000` 替代固定 64K；prompt 与 completion 共享
> 总窗口，输出同时受客户端请求、模型能力、剩余上下文和 Credit 预算收窄。线上服务器仅在
> `/tmp` 隔离副本执行 gofmt/vet/build、全仓 race tests、行数与双 Compose 门禁，生产工作树、
> 容器和数据库未修改。审计修复了简历新建 Outbox 忽略幂等键导致失败重试可重复创建，以及
> 缺失 main/secondary tier 时 3/2 bullet 门禁默认放行两处漏洞。最终 App `npm run check`
> 全绿：488 tests 中 486 pass、2 skip、0 fail，637 个源文件 ≤250 行，Web/Electron build
> 成功。模型注册值实测为 1M/384K；生产主 API 未配置额外 compaction threshold。

> **R6 尾行单点收敛与可见进度完成（2026-08-18，待一次真实验收）：**针对 v52 最终仍有
> 15 条短尾的失败，把普通尾行批次收窄到 2 条，零落地后只锁定最接近可行的 1 条；Agent 可在
> 一次工具调用提交 6 个完整 grounded 改写和 6 个 grounded 修饰语，宿主用真实 Chromium
> 批量测量、立即落地最大可行子集，并持久化候选指纹、行数、尾行像素与机械字符增量指引，避免
> 重复候选和盲猜循环。聊天区新增只来源于工具回执的事实进度，CDP smoke 会采集全过程文案。
> 自动质检全绿：550 tests 中 548 pass、2 skip、0 fail，670 个源文件 ≤250 行，Node/Preload/Vue
> typecheck、Node 与 Electron production build 全部成功；详细记录见 S4.5.1 阶段 15。

> **R7 v53 单次真实回归失败后停止（2026-08-18）：**v53 unpacked 的 Rust、protected build、
> ASAR/Fuses 加固与独立 bootstrap/CDP 验收均通过。唯一一次线上金融研究 JD 回归耗时
> 493.756 秒，单页 usage 93.23%，尾行从 18 条修到 9 条，revision 到 14，证明新单点反馈可以
> 连续落地，但仍慢于五分钟目标。共 29 次 apply，其中 1 次因模型把对象候选写成字符串数组而触发
> schema error；最终仍因模型输出停滞/重复终止，`generationReady=false`。过程进度采集已生效，
> 但存在“已实测 0 个候选”的误导文案。按用户约定不再修改或重跑；详细证据与产物哈希见
> S4.5.1 阶段 16。

> **R8 批量叠加收敛真实回归失败后停止（2026-08-18）：**用户确认简历最终门槛不降低，
> 欠填阶段改为先批量铺满到 ≥92%，允许临时短尾；尾行阶段最多 16 条同批实测并落地最大可行子集，
> 每次编译后再对全部剩余短尾叠加修复。欠填回执收敛为唯一 `requiredInput`，最多 8 个目标；增高与
> 尾行候选账本均跨 revision 保留未落地实测，单个无效尾行目标不再阻塞整批。prompt/tool schema 与
> 事实型进度同步更新。定向 49/49 通过；完整 `npm run check` 为 561 tests 中 559 pass、2 skip、
> 0 fail，676 个源文件 ≤250 行，双 typecheck、Node/Electron build 全绿。v55 Windows 打包、加固审计、
> 隔离安装/启动/卸载通过；唯一真实生成回归在 204.965 秒结束，前半段用 5 次 apply 从 42.05% 推到
> 单页 93.02%，但首次 17 尾行场景超过 schema 的 16 项上限产生 1 次 tool error，后续只降到 12 个
> 短尾并触发无进展重复保护，revision 6、`generationReady=false`。按停止规则不再修改或重跑，
> S4.5.1 仍不得标记完成；完整产物哈希、过程证据与截图见 S4.5.1 阶段 16 第二次稳定性优化记录。

> **R9 全尾行唯一清单与逐项反馈完成自动门禁、真实回归失败（2026-08-18）：**用户授权继续处理 v55
> 剩余根因，最终质量门槛不变。尾行批次不再截断为 16，公开 schema 移除固定数组上限，
> `nextAction.bulletIds` 成为唯一完整清单；重试账本改为每个未落地 bullet 各自保存真实测量 guidance，
> 页面容量冲突仍保留全部失败项并追加去重供体。进度投影按刚完成的操作而非下一动作判阶段。
> 修改前四类失败测试均复现，修改后定向 49/49；完整 `npm run check` 为 563 tests 中 561 pass、
> 2 skip、0 fail，677 个源文件 ≤250 行，双 typecheck 与 Node/Electron build 全绿。v56 加固打包、
> 隔离安装/启动/卸载通过；唯一真实生成回归在约 60 秒达到单页 93.09%，全程 0 schema/tool error，
> 但 11 次 apply 后 revision 停在 4，截图仍显示 11 个短尾，240 秒超时后由停滞/重复保护终止，
> `generationReady=false`。按停止规则不再修改或重跑，S4.5.1 不得标记完成；完整产物哈希、截图与
> 过程证据见 S4.5.1 阶段 16 第三次稳定性优化记录。

> **R10 尾行单修订迭代工作基线完成实现并首次真实达标（2026-08-18，严格 smoke 仍有一次已恢复错误）：**用户确认保持全部简历
> 门槛与批量能力，只替换尾行收敛逻辑。每目标每轮只提交一份基于最新 `currentText` 的 `revisedText`，
> 宿主明确要求增减字符范围；未通过但更接近的文本推进内部工作基线，更差文本回退，正式简历只接收
> 满足真实尾行和整页约束的最大安全子集。内容/证据/数字/重复/标点校验前置，最终 item 校验拒绝也不再
> 丢失测量账本；augmentation 确认与其他门槛不变。相关 51/51、完整 `npm run check` 565 tests 中
> 563 pass、2 skip、0 fail，679 个源文件 ≤250 行，双 typecheck 与 Node/Electron build 全绿；v57
> Windows 加固打包、隔离安装/启动/卸载通过。唯一真实回归在 221.328 秒完成 Assistant 回复，终态
> revision 10、单页 93.09%、22 条 bullet、短尾失败 0、最低尾行比 71.1%、0 violations、
> `generationReady=true`，相较此前 493.756 秒和 29 次 apply 降至约 221 秒和 14 次 apply。过程中一次
> 完全相同参数触发 `detected_repetition`，Agent 读取工作区后恢复并完成，故严格 smoke 仍返回
> `success=false`/exit 1；本记录只声明核心简历真实达标，不把单次样本包装成无错误稳定性证明，也不
> 降低 smoke 判定。完整产物哈希、截图、清理和限制见 S4.5.1 阶段 16 第四次稳定性优化记录。

> **R11 v57 多 JD 稳定性追加实测未通过（2026-08-18）：**用户要求继续验证两个跨岗位生成样本和
> 一个素材明显不足样本。连同 R10 投资者关系样本，4 个差异化 JD 中机器终态达标 2/4，严格无工具
> 错误成功 0/4：投资者关系 221.328 秒达标但有 1 次已恢复重复错误；首次安装产品实习生 228.345 秒、
> 单页 92.58%、27 条 bullet、短尾失败 0，但同样有 1 次重复错误；数据产品经理 240 秒超时于
> 87.64%，有 2 次重复错误；AI 应用开发实习生 240 秒超时于 77.60%，虽 0 tool error，却没有按素材
> 不足路径调用 `pause_resume_for_material` 或追问用户。结论是尾行单修订迭代能够在达标样本中清零
> 短尾，但跨岗位首稿篇幅与素材不足退出仍不稳定。当前物理可达性只计算把已有 bullet 补到三行后的
> 页高，不校验 JD 关键技能的来源覆盖；正确后续应以 must-have 语义覆盖门禁 + 连续零落地业务暂停来
> 保护用户，不降低任何简历或事实门槛。完整调用数、截图哈希与根因边界见 S4.5.1 阶段 16 多 JD
> 稳定性追加实测记录。

> **R12 教育完整性与信息层级完成自动化修复（2026-08-18）：**用户确认先处理两个教育问题。
> 生成快照现会分页补齐经历库中全部合格的 active 教育，按当前/至今优先、结束日期倒序固定排列；
> Agent 不传教育也不会遗漏，库中确实无教育时原硬门槛仍失败关闭。共享 preview/PDF 改为第一行
> “学校 · 学位”、第二行“专业 · 学院”，并兼容历史反向字段和新的规范字段，不迁移旧资产、不改变
> 工作/项目渲染。v67 prompt 明确教育 item 不得因 JD 或溢出删除；自动发现 ID 的短引用、扩源补充
> 事实保留和导入字段语义一并补齐。完整 `npm run check` 为 570 tests（568 pass、2 skip、0 fail），
> 681 个源文件行数门禁、模板同步、双端 typecheck 与 Node/Electron production build 全绿。本轮未
> 打包或真实生成，不改变 R11 的稳定性结论，也未处理关键技能证据门禁和篇幅阶段连续零落地暂停；
> 详细实现和验证见 S4.5.1 阶段 16 教育完整性与信息层级修复记录。

> **R13 关键技能证据门禁与篇幅连续零落地暂停完成自动化修复（2026-08-18）：**在用户确认不降低
> 任何简历门槛的前提下，工作区会对 must-have `technology`（兼容旧 `technical/skill`）要求执行
> 确定性来源证据门禁；缺失时写作前立即进入 `needs_user_decision` 并追问具体项目事实，无关回答不能
> 解锁，相关用户事实通过既有 `add_resume_material` 恢复。篇幅阶段同时支持用未消费相关事实新增
> bullet 和基于已有证据大幅扩写 bullet，但每轮仍只提交一种可测量输入；连续两轮真实零增高后由
> 业务状态暂停追问，真实增长或补充事实会清零，schema/证据/数字等非法输出不计轮次。v68 prompt 与
> 工具合同同步，尾行、单页、≥92%、>70%、证据、数字、教育和确认门槛均未改变。完整
> `npm run check` 为 577 tests（575 pass、2 skip、0 fail），683 个源文件行数门禁、模板同步、双端
> typecheck 与 Node/Electron production build 全绿。本轮未打包或执行真实模型多 JD 回归，R11 的
> 稳定性失败结论暂不改写；详细边界见 S4.5.1 阶段 16 对应修复记录。

> **R14 v58 引导式 smoke 不能作为自然输入稳定性证据（2026-08-18，用户复核撤回原结论）：**完整
> `package:win` 的加固、安装和启动门禁本身仍有效，但两个用户消息分别主动写入“完整检索、素材不足
> 及时追问、不要降低门槛”和“关键技能不足及时停止、不要用弱相关经历强行补篇幅”，泄露了待验证的
> 期望路径。数据产品 174.688 秒机器达标、AI 应用开发 24.276 秒暂停的结果只保留为引导式 smoke
> 观察，不再声明 R11 两个自然输入失败已经解除。用户同时发现成稿普遍为 1 行 bullet；代码确认现有
> readiness 没有 main/secondary bullet 至少 2 行的门槛，且欠填策略优先新增独立 bullet，确会形成
> “数量多但信息密度低”的结果。下一轮须先建立普通经历 bullet 2–3 行合同、合并/删减策略，再用不
> 含策略提示的自然短消息重跑。产物哈希、截图、调用数与撤回原因见 S4.5.1 阶段 16 对应记录。

> **R15 一行 bullet 深度链路已统一为叠加改写，v64 单次真实回归仍失败（2026-08-18）：**旧的
> `repair_bullet_depth` 完整 items 重写及其 `itemTargets/mergeEvidenceTargets` 已删除；深度阶段现在
> 强制一次 `lineRewrites` 覆盖全部短 bullet，每目标只写一份基于最新正文和精确字符增量的完整改写。
> 同一行内的有效增长立即递增 revision 并成为下一轮基线，跨到 2–3 行的结果同批落地；循环进度纳入
> 正文，过程提示独立标识深度修复。完整 `npm run check` 为 593 tests（591 pass、2 skip、0 fail），
> 687 个源文件 ≤250 行，双 typecheck 和生产构建全绿；v64 Windows 加固、安装、真实 bootstrap 与
> 卸载门禁通过。唯一自然短消息回归中，新机制首批真实同时应用 23 条，并把 80.0% 依次推进到
> 100.4%；溢出缩源后继续修复。但最终在 308.347 秒、revision 10、单页 85.99% 时仍剩 3 条一行
> bullet，模型流输出触发停滞/重复保护，`generationReady=false`。因此只证明旧深度技术债已经删除且
> 新叠加链路真实执行，不能声明稳定生成完成；按用户约定只测一次，不修改或重跑。完整产物哈希、
> 截图和调用证据见 S4.5.1 对应记录。

> **R16 溢出阶段改为单条 bullet 最小损失删减（2026-08-18，真实验证局部通过、整份生成仍失败）：**针对 v64
> 从 100.4% 缩源后骤降至 81.6% 的新根因，`reduce_overflow` 现优先返回按真实行数筛出的最短额外
> bullet 候选，schema 与宿主均硬限制每轮只删 1 条并立即重排；只在所有 main/secondary 已到最低
> 条数时才允许当前非教育来源集合精确减去 1 段。提前缩源、一次删两段、新增/替换经历或改变保留
> tier 均 recoverable 拒绝且不推进 revision；教育、main≥3、secondary≥2、普通 bullet 2–3 行、
> 单页、≥92%、尾行、事实/数字与确认门槛不变。定向 49/49，完整 `npm run check` 为 596 tests
> （594 pass、2 skip、0 fail），689 个源文件 ≤250 行，模板、双 typecheck 和两端生产构建全绿。
> v65 完整 Windows 加固、安装、bootstrap 和卸载门禁通过。唯一自然短消息真实回归从 revision 2 的
> 80.02%/23 条一行 bullet 推进到 revision 7 的 98.80%；后续溢出阶段没有再次 create 或删除整段
> 经历，而是逐次移除 5 条额外 bullet，最终仍保持单页 98.59%，证明 v64 跌至 81.6% 的过度删除根因
> 已真实解除。但 420 秒后仍余 3 条短尾并触发模型停滞/重复保护：35 次工具调用、0 tool error、
> revision 17、`generationReady=false`，因此整份简历稳定性仍未通过。产物哈希、截图和清理证据见
> S4.5.1 阶段 17；按约定没有第二次回归。

> **R17 教育固定三行展示与运行时间口径更新（2026-08-18 至 2026-08-19）：**用户先要求把此前
> 累积修复本地提交，已创建 commit `59daa33`（`feat(resume): stabilize phase-driven generation
> workflow`），未 push、上传或发版；本节教育改动发生在该提交之后，当前仍未提交。用户随后确认教育
> 固定为第一行“学校 · 学历（左）—时间（右）”、第二行“专业 · GPA（专业排名）（左）—地点（右）”、
> 第三行“主修课程”，其中标准示例为“计算机科学 · GPA 3.8/4.0（专业前 10%）”。宿主现从锁定的
> education Experience 正文确定性提取 GPA、排名和课程，缺失选填直接省略且不补造；全部 active 教育
> 仍自动纳入。Agent 的 `apply_resume_content` 与手动编辑器均不能改写或删除固定教育内容，prompt/schema
> 同步禁止把教育作为生成或溢出删减目标；预览、隐藏 Chromium 与 PDF 完整性检查继续共用同一字段
> presenter。标准 Electron Chromium/PDF QA 通过：单页使用率 96.23%、最低尾行比 76.79%，工作区
> 基准使用率 97.79%、22 条证据绑定，导出文本包含 GPA、专业排名和主修课程。完整 `npm run check`
> 通过：601 tests（599 pass、2 平台条件 skip、0 fail）、690 个源文件 ≤250 行、模板同步、Node/
> Preload/Vue typecheck、Node build 与 Electron production build 全绿。用户同时把当前端到端验收窗口
> 更新为十分钟：正式包本来就没有按分钟停止的墙钟超时，自动化的 `--timeout` 只负责观察并判定测试；
> 应用内复读、停滞、无进展和最大回合保护仍保留。600 秒内必须交付合格预览，所有简历质量门槛不变。
> 用户随后要求本地打包 v66。按 hardening runbook 重新执行 `npm run check`，601 tests（599 pass、
> 2 skip、0 fail）及全部门禁通过，`npm audit --omit=dev --audit-level=high` 为 0 vulnerabilities；首次
> `package:win` 在 Node 启动 `rustup.exe` 时遇到瞬时 `EPERM`，确认 rustup/Node spawn 恢复后从完整
> `package:win` 起点重跑，没有复用半成品密钥。最终 Rust 3/3、protected build、NSIS、14,889 个 ASAR
> 文件、1,097-byte loader、984,496-byte encrypted payload、262,144-byte native module、Fuses、
> 隔离安装、真实 bootstrap、Renderer 健康及卸载清理均通过。v66 本地安装器
> `local-builds/v66/Coolto-0.1.18-x64.exe` 为 135,035,729 bytes，SHA-256
> `3FE5CAE7B11F136649A3AAEA4A1E78FBC8B57A1D060F38042C8167017B5AC254`；unpacked EXE 为
> 225,686,528 bytes，SHA-256 `DC372684F5F1E7E11EFD4CC4871D7735F7AA0C763F5EA54C703A1503A7D0CB3D`，
> Authenticode 均为 `NotSigned`。生产更新源仍为 `https://home.coolto.com.cn/downloads/`；归档后精确
> 关闭 v66 的 5 个进程，最终 Coolto/Electron 均为 0。没有真实模型生成、commit、push、上传或发版，
> 因此不改写 v65 的稳定性失败结论，S4.5.1 仍不得标记完成。

> **R18 尾行单稿叠加与重复调用收敛（2026-08-19）：**用户确认尾行修复不得再采用任何候选、备选、
> 多版本、片段修饰语、隐藏工作稿或全页组合形式。当前协议对每个短尾只暴露当前正式文本和目标字符
> 增量，Agent 只返回一份完整 `revisedText`；整批一次 Chromium 测量，同一行数下通过或尾行比例真实
> 提升至少 1.5% 就立即正式落地，下一轮在该正式文本上继续叠加。旧九个尾行候选/缓存/组合模块和
> 三组旧测试已删除。无进展第一轮调整、第二轮整句重组、第三轮追问具体新事实；所有简历门槛不变。
> 相同工具与参数第二次即拦截，仅一次基础设施瞬时错误可原样重试；create/get/apply/add material 共用
> 内容进展指纹，revision 和计数器不再伪装进展，自动 follow-up 不因计数空转。定向 87/87、完整
> `npm run check` 590 tests（588 pass、2 skip、0 fail）以及模板、685 文件行数门禁、双 typecheck、
> 两端 build 全绿。真实 Electron Chromium/PDF QA 通过：单页 96.23%、最低尾行 76.79%、工作区
> 97.79%、22 条证据绑定；QA 启动脚本同时隔离了环境中的 `ELECTRON_RUN_AS_NODE`。本轮未跑真实模型、
> 未 package/commit/push/上传/发版，因此仍不覆盖 v65 的真实稳定性失败，S4.5.1 保持未完成。

> **R19 v67 本地包与真实自然输入回归（2026-08-19，失败后停止）：**重新执行完整 `npm run check`
> 590 tests（588 pass、2 skip、0 fail）与 0 production vulnerabilities 后，完整 Windows 加固链路通过
> Rust 3/3、protected build、NSIS、Fuses/ASAR、隔离安装、真实 bootstrap、Renderer 健康和卸载清理。
> v67 安装器为 135,020,650 bytes，SHA-256
> `E684CD9EAB08D6F37F45E506371B408F005F430279EFAB4EFCEB2CD4C2D3E91D`；unpacked EXE 为
> 225,686,528 bytes，SHA-256 `329E328B82D83F1F9426CF89C7DCA03EEEC4367B0ECA7A7B837FFAC1AF6DAB70`，
> Authenticode 均为 `NotSigned`。唯一真实请求为新对话自然消息“帮我生成一份数据产品经理简历”，
> 222.8 秒自行结束；25 次工具全部 completed、0 error、无 schema error、无重复 create 或复读保护。
> 首稿单页 83.83%/23 条一行 bullet，深度扩写后按最小删减保留 17 条普通 2 行 bullet，最终单页
> 99.41%。三次无候选尾行批次真实推进 2 条、15 条并通过 4 条，但仍有 13 条短尾、最低 9.14%；
> 模型错误地把“页面无空间”解释为不能继续填充同一 2 行，主动暂停追问，终态 revision 15、
> `needs_user_decision`、`generationReady=false`。过程提示还误报“剩余 0 条”，实际为 13 条。截图
> `local-builds/v67/data-product-natural-run-1.png` 的 SHA-256 为
> `6CD878AB4E3A7D02C6B3C6B178F769D70554CA146C9331BF5118A66A59F04138`。按一次回归边界没有修改或
> 重跑；5 个 v67 进程和 CDP 9222 已清理。没有 commit/push/上传/发版，S4.5.1 仍未完成。

> **R20 尾行局部进展继续叠加（2026-08-19）：**v67 的提前暂停根因已按真实证据修正：每个 bullet
> 仍在两轮无进展后切换并保持整句重组，但不再由任一 bullet 的失败次数暂停整份简历。只要当前批次有
> 任一正式文本落地或通过，整批零进展计数就归零，并继续返回全部剩余短尾；只有整批连续三轮完全
> 零落地才追问素材。v79 prompt 同步明确同一 2 行内填充尾行不增加页面高度，99% 页面使用率不是停止
> 理由。进度 UI 现从真实 `bullet_tail_too_short` violations 回算切换阶段后的剩余数量，v67 的“剩余
> 0 条”将正确显示为 13 条。协议仍为每目标唯一完整 `revisedText`，没有候选或隐藏工作稿，所有质量
> 门槛不变。定向 61/61、完整 `npm run check` 592 tests（590 pass、2 skip、0 fail）以及模板、685
> 文件行数门禁、双 typecheck 和两端 build 全绿。本轮未跑真实模型、未 package/commit/push/上传/
> 发版，S4.5.1 仍未完成。

> **R21 v68 尾行整批叠加真实回归（2026-08-19，仍未通过）：**重新执行完整 `npm run check`，592
> tests（590 pass、2 skip、0 fail）及全部构建门禁通过；完整 Windows 加固包同步通过 Rust 3/3、
> protected build、NSIS、Fuses/ASAR、隔离安装、真实 bootstrap、Renderer 健康和卸载清理。v68 安装器
> 为 135,020,693 bytes，SHA-256 `389BD32A0A4023CD66AEB1DE72437262154C4360FF8C87A2CEA6C782124C2C6F`；
> unpacked EXE 为 225,686,528 bytes，SHA-256
> `1F0063E917776B7CFEC2381C9D6413E224717F0CF3D88ACE7B954FF3902A581A`，Authenticode 均为 `NotSigned`。
> 唯一真实输入仍为无策略提示的“帮我生成一份数据产品经理简历”，413.8 秒自行结束且没有墙钟、运行、
> 工具或 schema 错误。首稿单页 79.25%/20 条一行 bullet；深度扩写和最小删减后保留 17 条普通两行
> bullet，单页 99.41%。尾行从 17 条全未通过开始正式叠加，revision 16 在通过 4 条、剩余 13 条时没有
> 再误暂停，并继续到 revision 17 通过 8 条、剩余 9 条，证明 R20 的整批进展语义和剩余数量投影已在
> 真实链路生效。随后连续三整批没有任何版本同时保持两行且真实提升 ≥1.5%，宿主按新规则进入
> `needs_user_decision`；终态 17 条普通 bullet 全部两行，但 9 条尾行仍处于 21.94%–69.48%，
> `generationReady=false`。正式文本已明显变长并产生重复补语，当前根因收敛为两行容量上限附近的低命中
> 改写与冗余，而非候选、拒绝叠加或局部成功误暂停。截图
> `local-builds/v68/data-product-natural-run-1.png` 的 SHA-256 为
> `25F55E532D99A0D0DC4EC2BB07AD7BAB71162C4FE91930179BC32A5CE2983CDC`；右侧预览正文仍未在截图中绘出，
> 虽然 DOM 文本和高度存在，故视觉验收同样不通过。5 个 v68 进程和 CDP 9222 已清理；没有 commit、
> push、上传或发版，S4.5.1 仍未完成。

> **R22 尾行批量语义扩写协议（2026-08-19，自动化完成）：**根据后续 v92 真实失败，已删除要求模型
> 逐字保留原文并完成单点连续插入的尾行协议，改为每批最多 8 条、一次完整覆盖本批 `bulletIds` 的自然
> 语义扩写。每条只返回唯一完整 `revisedText`；模型看到当前总字数及最低/优选/最高成稿总字数，优选值
> 位于真实像素可行区间内偏长的 70% 位置，并明确“无法精确计数时宁长勿短”。旧 edit-plan、single-
> insertion、insertion-validation、tail padding 和 batch insertion-template 模块及专用测试已直接删除，
> 不保留兼容分支。来源/数字、原有数字保留、重复与空泛文本、2–3 行、保持当前行数、单页、≥92%、
> 尾行 >70%、真实改善叠加和整批三轮零落地暂停门槛均未降低。定向 79/79、完整 `npm run check`
> 607 tests（605 pass、2 skip、0 fail）、687 文件行数门禁、双 typecheck/双 build 全绿；真实 Electron/
> Chromium/PDF QA 同步通过（固定样例 96.23%、最低尾行 76.79%，工作区样例 97.79%、22 条证据绑定）。
> 本轮未跑新的真实模型生成，未 package/commit/push/上传/发版，S4.5.1 仍未完成。

> **R23 尾行批次隔离真实模型评测（2026-08-19）：**新增独立 harness，跳过整份简历，仅使用当前生产
> prompt/schema 对 8 条真实风格短尾独立运行 3 批。`deepseek-v4-flash` 在 33.902 秒内产出 24 条唯一
> 完整 `revisedText`：24/24 严格变长、达到最低和优选总长度、保留原数字，增量 `+17～+32` 字、平均
> `+24.5` 字，确认批量语义扩写和不再原样返回已经稳定生效。但只有 6/24 未超过最高总长度，18/24
> 偏长；模型倾向直接采用完整 source quote，下一隔离优化点是明确“source quote 仅为素材池、只选 1–2 个
> 足够细节”，并把“宁长勿短”限定在最高值以内。第 1 批有效提交后出现一次受保护的重复调用，第 2、3
> 批干净结束。报告位于 `local-builds/tail-repair-eval/report-1787104011143.json`；未跑整份简历、未打包、
> 未 commit/push/上传/发版，S4.5.1 仍未完成。

> **R24 v93 整简历真实回归（2026-08-19，最终产物达标、运行仍有 1 个工具错误）：**保持阶段 24 的
> 当前 prompt 不变，完整 `npm run check` 607 tests（605 pass、2 skip、0 fail）及 Windows x64 加固打包、
> NSIS、release audit、隔离安装、真实 bootstrap、Renderer 健康与卸载清理全部通过。新对话仅发送自然消息
> “帮我生成一份数据产品经理简历”，观察约 473.159 秒后达到 revision 27、`ready_for_approval`、
> `generationReady=true`、单页 99.33%；18 条普通 bullet 全部两行，24 次批量尾行扩写把 18 个短尾清零，
> 最低尾行 70.24%，质量门槛未降低。32 次 apply 中 31 成功、1 次完全相同参数的重复调用被保护拒绝，后续
> 仍自行恢复并完成，因此产物真实达标，但严格 smoke 仍为 `success=false`，且尾行 24 次往返仍偏慢。
> 截图 `local-builds/v93/data-product-natural-run-1.png` 的 SHA-256 为
> `C1761560784BFEFCF2EED66CC360BAA7B326AD77F9ACDAF27D9551F78F3E4598`；右侧正文仍未视觉绘出，尽管 DOM
> 有 2,553 字和 6 个 section，视觉验收未通过。安装器 SHA-256 为
> `3C9300BE3CC0E2A6B1B9B1F1B8E21C83B0FBE699E1F359158786AB4BDFB24D32`；未 commit/push/上传/发版，
> S4.5.1 仍未完成。

> **R25 v93 第二 JD 真实回归（2026-08-19，首稿阶段失败）：**复用同一 v93 包，新对话仅发送自然消息
> “帮我生成一份小米集团投资者关系实习生简历”，Agent 正确读取 JD 库中的对应岗位。运行 149.613 秒后
> 在 revision 3、单页 78.04% 终止：前三个 item 批次真实推进到 55.50%/67.57%/78.04%，此后连续 6 次
> item 批次均 completed 但零落地、零 revision 变化，三次重新读取工作区仍未改变策略，最终触发通用无进展
> 保护。终态 15 条 bullet 中 6 条仍为一行，另有一段经历 bullet 数不足；尚未进入 depth/tail repair，
> 9 次 apply、0 tool/schema error。截图 `local-builds/v93/investor-relations-natural-run-2.png` 的 SHA-256 为
> `0123E720B505AB0B86E580115AC01A900D2EDBC31709B51EADC4F60D9EC01956`，预览正文视觉缺失问题仍复现。
> 本次失败证明 v93 还不具备跨 JD 稳定性；未重跑、修改、commit、push、上传或发版，S4.5.1 仍未完成。

> **R26 bullet 数量补齐无效重试隔离诊断（2026-08-19）：**失败草稿唯一缺条数的是 36Kr
> `secondary` 经历（0/2），原文实际有两条独立成果链，所以宿主继续返回 `repair_bullet_counts/items` 正确，
> 并非错过 depth/tail 阶段。新增独立生产 prompt/schema/校验 harness；相同原文 3/3 次均先把来源
> `100K+` 写成“10 万”而 rejected，改回 `100K+` 后 success。确定性根因是数字解析只接受 `10万`，把带
> 中文排版空格的 `10 万` 解析为 `10`；第二个根因是填充词检测仅统计末尾 64 字里的“与”，把“与 VC
> 合作、半导体与泛 AI、尽调与访谈、备忘录与商业模型”这类真实并列误报为抽象堆词。真实 revision 3
> workspace 干净重放 3 次均可在 2–3 次内成功，证明草稿、evidence、schema 和 LLM 能力本身可解；原链路
> 的多轮零 revision 是两个 fail-fast 误判串行暴露后，又被只看 workspace progress key 的通用保护累计。
> 一块 evidence/两条最低要求的对照组则连续 3 次变更文本但始终复用同一 evidence，未调用素材不足暂停，
> 证明 `repair_bullet_counts` 还缺独占证据不足的确定性出口。报告为
> `local-builds/bullet-count-retry-eval/report-1787106834129.json`；本轮未改生产逻辑或任何门槛，typecheck 与
> 687 文件行数门禁通过，临时解密脚本已删除，未 package/commit/push/上传/发版，S4.5.1 仍未完成。

> **R27 bullet 数量链路收敛修复与分部真实模型验收（2026-08-19）：**保持一页、≥92%、main/secondary
> 3/2 条、普通 bullet 2–3 行、尾行 >70%、事实/数字/教育/确认门槛不变，修复四类根因：数字与
> `万/K` 等单位之间的空格现在等价规范化；真实“与”并列不再被抽象词规则误杀；英文词内公共片段不再被
> 复读规则误判；同一 item 的所有 bullet 错误一次聚合返回。`repair_bullet_counts` 现明确给出当前 bullet、
> 缺口、精确 evidence 和完整批次目标，并强制一次 items 覆盖全部目标；可独占事实不足最低条数时直接
> `request_more_material`，用户回答前禁止继续写。循环 key 按剩余结构化错误集合计数：错误缩小视为进展，
> 同类失败换措辞仍算无进展，完全相同参数继续由 repetition guard 拦截；prompt 升至 v100，未引入任何
> 候选/备选协议。36Kr 双 evidence 真实模型隔离 3/3 均一次 apply 成功（5.032–8.250 秒），单 evidence
> 对照为 apply=0 直接停止，报告 `local-builds/bullet-count-retry-eval/report-1787108186894.json`；人为同时
> 注入标点/缺 evidence/虚构数字三错的聚合收敛测试 3/3 也均一次 apply 全部修正（4.939–7.532 秒），报告
> `local-builds/resume-retry-convergence-eval/report-1787108289196.json`。完整 `npm run check` 为 612 tests
>（610 pass、2 skip、0 fail）、690 文件行数门禁、全 typecheck/build 通过。本轮未跑整份简历、未打包、
> 未 commit/push/上传/发版，S4.5.1 仍未完成。

> **R28 v94 Windows 测试包与投资者关系整简历回归（2026-08-19）：**完整 `package:win` 通过 Rust 3/3、
> protected build、NSIS、release/Fuses audit、隔离安装、真实 bootstrap、Renderer 健康和卸载清理。安装器
> 135,033,136 bytes，SHA-256 `F2DC706BB81DCA2E16EA0818DCD85C4B589A5BF26AF456968C21D6FDD2881B23`；
> unpacked EXE 225,686,528 bytes，SHA-256 `6D88BF983A36E5D469294D4809AC07125C938882456AFAEA6597F606A56D9BCA`，
> 均 `NotSigned`。v94 新对话只发送“帮我生成一份小米集团投资者关系实习生简历”，308.814 秒后达到
> revision 19、`ready_for_approval`、单页 92.52%、尾行与 blocker 清零；36Kr 0/2 的历史失败点在首个完整
> items 批次中一次补齐。22 次 apply 全部 completed、toolErrors/schema/repetition guard 均为 0、无连续相同
> 尾行批次；仍有篇幅/尾行各 1 次整批零 revision，之后正常收敛。生成链路本 case 已通过，但像素预览仍
> 失败：DOM 含完整正文，右侧截图却只显示联系方式和分隔线。截图 SHA-256
> `A61A8ABC8C4A2B44E03C86A2ECAEF7D5B225CB12866915F84EE162B9064F1B43`，摘要位于
> `local-builds/v94/investor-relations-natural-run-1-summary.json`。测试后关闭 5 个 v94 进程；未 commit/push/
> 上传/发版，视觉问题未通过前 S4.5.1 仍未完成。

> **阶段化重构实施入口：`S4.5.1-phase-driven-resume-generation.md`**（用户 2026-08-17
> 定稿：生成规则 6 条 + 决策记录 + Phase 总览 + 代码实施方案）。本节以下历史记录为
> 根因与决策背景；S4.5 当前推进以 S4.5.1 为准。

> 本节把 2026-08-16 至 2026-08-17 围绕“经历少时循环卡死、经历多时超过操作次数”的
> 服务器取证、架构约束、实现、真实 Electron 迭代和最终产品决策合并为一条可继续执行的
> Roadmap。它补充并覆盖本节之前的分轮修复记录；发生冲突时，以本节较晚确认的决策为准。

**用户确认且不得回退的产品/架构边界：**

- 产品继续只有一个由聊天自然语言驱动的通用 Agent；不存在“简历模式”、宿主意图路由、
  按经历类别写死 bullet 数量或固定的宿主生成工作流；
- 宿主可以执行与内容无关的运行时治理、事实/数字校验、真实 Chromium 版面测量和“数学上
  是否可达”的确定性门禁，但不得替 Agent 选择经历、分配 bullet、编写或补写内容；
- DeepSeek 总上下文为 1,000,000 Token、模型输出 ceiling 为 384,000；prompt 与 completion
  共享总窗口，Credit 按本次请求动态预留和结算，Credit 耗尽/不足后立刻停止，不再重试；
- 页面最低占用率保持 92%，高占用率不拒绝但不得超过一页，bullet 尾行保持 >70%，真实性、
  数字逐字可验证、字体和一页门槛均不得为了“生成成功”而降低；
- 不改变现有总体生成 method；修复对象是不可达状态、上下文膨胀、流式复读和错误的规划/
  校验反馈，不以更多兜底掩盖根因；
- `cv-agent-api-service` 已允许提 PR 并部署；App 只允许本地构建、打包和真实桌面测试，当前
  明确不得上传或发版。本轮同样未获得 App commit/push 授权。

**全局根因图（按触发顺序）：**

1. 经历很多时，snapshot/Search/Workspace 大结果随每轮历史累积，旧的候选封顶和本地压缩
   阈值又与服务端 prompt 门槛不一致，导致 prompt 持续增长，最终出现 413/“输入超过操作
   上限”；输出被 16,384 Token 固定截断时还会生成不完整工具调用并继续重试。
2. 经历很少或所选材料虽然有多条、但物理内容不足时，92% 页面门槛与“不得编造”形成不可
   同时满足的约束。旧链路即使已经计算出 `insufficient=true`，也只把它当提示交给模型，
   仍允许创建草稿并进入 writing。
3. 首稿长度反馈与真实版面预算不一致：规划结果要求 46 行、至少 16 条且中文约 94–165 字，
   但 `write_bullet` 默认下限实际为 75 字，乘长度容差后约 60 字也能通过；Agent 即使主动
   提高 `targetChars.min`，`clampAgentTarget` 仍会把下限压回 75。首稿因此天然偏短，把大量
   工作推迟到证据耗尽后的补长阶段。
4. 证据耗尽后，Agent 被同时要求继续达到 92% 并不得重复/编造，只能围绕同一 evidence
   反复追加泛化修饰语；这些轮次可能交替出现 thinking、短文本自我否定、部分成功 patch、
   截断和不同措辞，因此绕过单一的 identical/stalled/失败次数守卫。
5. 外层 continuation 原先看不到一次 `agent.prompt()` 内部的多轮工具循环，且流式输出可以
   在单轮里先发生字面复读；因此只在外层增加“操作次数”或墙钟上限只能止损，不能消除上述
   不可达状态。

**已完成实现（保留通用 Agent，不引入宿主简历模式）：**

- 大上下文治理：模型可见 evidence 固定封顶 48 且按经历均衡；搜索列表不再携带完整正文；
  Workspace 建立后压缩旧 JD/Experience/Snapshot/Layout 工具结果；本地 compaction 与服务端
  prompt 预算对齐；prompt-limit 错误不可续接；
- 通用运行时治理：接入 pi-agent-core 的 turn stop hook；增加同结果、连续工具错误、纯
  thinking、无进展、输出截断、初始回合超时、续接墙钟和 Agent idle 超时等可观测终止条件；
  这些条件只停止无效模型调用，不决定简历内容；
- 流式复读治理：新增 `output-repetition-guard.ts`，在同一 assistant 流尚未形成工具调用前
  检出长片段重复并中止；第一次复读允许一次带保留状态的通用恢复，恢复指令要求直接执行
  下一个产生实质进展的工具调用；第二次复读才归一终止，避免第一次波动直接变成 UI 错误；
- Credit/Token：App 移除 `maxTokens: 16384` 产品固定覆盖；API Service 的 64K 输入门禁、
  原子 Credit 范围预留、动态输出额度反算和 Credit 首错终止已部署并通过正式流水线；
- 证据正确性：英文 evidence 按普通句点分句但保留小数点；`$1.44` 与中文本地化
  `1.44 万亿美元` 通过统一数字 canonicalization 视为同一来源数字；`GPA: 3.89/4.0`
  这类“短标签 + 单一标量”仍可参与账本校验，但不再虚增可独立写成 bullet 的模型容量；
- Workspace/patch 反馈：部分成功、已应用、拒绝和自动修复结果每轮覆盖旧状态；terminal
  Workspace 拒绝后续 patch；输出 `continuation.reason`、剩余 evidence、真实 px、尾行缺口
  和最佳快照，避免模型把历史拒绝当作当前失败；
- 代码门禁：把 continuation 单轮超时职责拆到 `continuation-turn-timeout.ts`，相关业务文件
  保持在 250 行硬上限内；新增/更新 Agent loop、turn governor、复读、数字、证据规划、
  Workspace、patch、上下文和 Credit 回归测试。

**真实 Electron 迭代证据（最新本地 0.1.18 包，未发版）：**

- 通过 Windows 桌面真实输入同一自然语言命令：“请重新为当前战略发展部实习生岗位生成一份
  针对性简历，使用经历仓库中合适的经历”；没有注入简历模式或测试专用宿主步骤；
- Agent 自主定位 JD，并选择 Investment Research、OSL Business Development、Growth &
  Community Operation、CUHK Master、ZJU Bachelor 共 5 条经历；规划器真实返回
  `requiredBulletLinesAtMinimum=46`、`minimumDistinctBulletsAtMaxLines=16`、
  `charsPerLine=55`；去除短 GPA 标量后可写容量为 `7+3+5+1+1=17`；
- 最新一轮成功写入 17 条有来源 bullet，`$1.44 trillion` 本地化后的 `1.44 万亿美元`、
  `99%`、`10+`、`50+` 等数字均通过证据校验，技能 synthetic item 不存在时也能正常跳过；
- 首次完整写入后页面占用率为 76.0%；批量补长后仅到 80.3%，仍差约 122.9px，并剩 5 条
  尾行违规。此时所有独立 evidence 已耗尽，模型开始重复“让我写一个真正不同的补充”等
  自我纠正语句；流式复读守卫已使本轮安全停机，未再出现数小时卡死，但结果没有达到
  92%，因此这次实测明确记为**未通过**，不能作为 S4.5 完成证据；
- 本轮实测同时证明：当前最后的主阻塞不是 Credit、413、数字校验或工具调用次数，而是
  “规划器已知素材/版面不可达，却仍允许进入草稿写作”，以及首稿长度下限与规划预算脱节。

**最终产品决策（2026-08-17 用户确认，覆盖此前“不做生成前预检拒绝”的旧决定）：**

- 如果当前选择的素材在真实模板、固定字体、92% 门槛和最多 3 行/bullet 条件下物理不可达，
  就**不应该继续写成简历**；应先由 Agent 放宽相关性条件搜索其余可用经历；
- 如果扫描全部可用且可验证的相关经历后仍然不可达，立即停止生成，返回
  `needs_user_decision`，用自然语言追问用户补充经历、项目细节、职责范围、方法、量化成果
  或技术栈；不得创建一个注定失败的草稿，不得靠 XX 占位符或泛化修饰语硬填页面；
- 已经进入写作后，如果真实 compile 显示低于 92%、未消费 evidence 已耗尽且当前内容无法
  通过事实等价的局部修复达标，也立即进入同一 `needs_user_decision` 分支；
- 这是“可达性/真实性门禁”，不是宿主内容编排：Agent 仍自主选择搜索词、经历范围、内容
  顺序和用户追问方式；宿主只拒绝数学上不可能满足产品门槛的写入流程；
- UI 对用户应表现为正常的补充信息对话，不显示“超过操作次数”“循环卡死”或内部守卫错误；
  已生成的最佳本地候选可以保留为草稿证据，但不得声称它是合格简历。

**依赖修复（2026-08-17，用户要求修掉 pi-agent-core 补丁报错）：**

- 此前 S4.5 采用”锁 pi-agent-core 0.81.1 + postinstall 精确改写 node_modules dist”的兼容补丁，
  依赖一升级就会报 `Unsupported pi-agent-core version`。
- 核实：pi-agent-core 0.84.2 **已原生透传 `shouldStopAfterTurn` 钩子**（agent.js 内完整接线，
  与补丁脚本手加内容一致），因此直接升级根除该错误源：
  - `package.json`：`@earendil-works/pi-agent-core` 与 `@earendil-works/pi-ai` 均 0.81.1 → 0.84.2
    （pi-agent-core 0.84.2 依赖 pi-ai ^0.84.2，必须同步升避免双版本 skew）；删除
    `postinstall: patch-pi-agent-stop-hook.mjs`；删除 `scripts/patch-pi-agent-stop-hook.mjs`；
  - 升级不影响任何 App 调用面（AgentTool/AgentMessage/BeforeToolCallContext/ShouldStopAfterTurnContext/
    StreamFn/estimateContextTokens/deepseekProvider 等导出均在）；Node ≥22.19 满足（本机 24.x）。
- 此变更**覆盖**本节早前”未升级依赖、未引入额外包”的记录：升级是用户要求的修复方式，且升级后
  不再依赖任何 node_modules 改写脚本。

**Roadmap 表第 1–4 项实施记录（2026-08-17）:**

- **第 1 项（生成前可达性门禁）已完成**：
  - 修正 `estimatedMaxUsageRatio` 物理上限公式：由”证据原文长度 × expansion 外推”改为
    **”可写容量 × 单条最大行数”**——模型把证据扩写成完整事实句是正常写作，按原文长度线性外推
    会系统性低估（真实实测 17 条证据已到 80.3%，旧公式会误杀），也覆盖”3 行 bullet 可达标的
    样本不得被理论估算误伤”的旧论断；新公式下门禁恰好等价于”可写容量 ≥
    `minimumDistinctBulletsAtMaxLines`”（`ceil(requiredBulletLinesAtMinimum / maxBulletLines)`）；
  - `prepare_resume_draft` 执行”写作前确定性门禁”：无工作/项目经历（`no_writable_experience`）
    或 `layout.insufficient`（`layout_unreachable`）时**拒绝创建 workspace**，返回明确文案——
    先用更宽条件 `search_experiences` 扩大搜索并重新 prepare，穷尽后停止生成、回复用户逐一追问
    缺失事实；不创建注定失败的草稿，不用 XX 占位符/泛化修饰语硬填。`calibrateTypography` 改为
    顺带返回空骨架编译结果，prepare 不增加第三次编译。
- **第 2 项（动态首稿长度合同）已完成**：
  - `ResumeWorkspace` 新增 `layoutBudget`（真实 cpl、`requiredBulletLinesAtMinimum`、
    `writableBulletCapacity`、`maxBulletLines`），prepare 时写入并在 model payload 暴露；
  - `write_bullet` 默认 targetChars 改为由 `layoutBudget` 动态给出：每 bullet 目标行数 =
    `requiredBulletLinesAtMinimum ÷ 可写容量`，min = max(1 行, 目标行数 × cpl)，max 封顶物理
    单条上限（cpl × maxBulletLines）；**删除把 Agent 更高下限压回 75 的反向 clamp**，显式
    target 只做物理上限收窄；无预算的旧存档回落 75-165/130-310；
  - `instructionFor` 的 bulletCharTarget 同步走 `layoutBudget`，指令提示与宿主校验一致。
- **第 3 项（写作中证据耗尽立即 terminal）确认并补回归**：`workspace-status.ts` 的”仅欠填 +
  全部经历已写 + 未消费证据为 0 → `needs_user_decision`”推导此前已实现（patcher / inspect /
  preparer 均带 evidenceState）；本次新增工具层回归测试（prepare → 写满全部证据 → inspect 归一
  `needs_user_decision`），证明正常素材不足路径由状态推导终止、守卫不承担业务流控制。
- **第 4 项（三组回归）已完成**：新增 4 个回归（规划前不可达拒绝且不建 workspace、充足素材通过
  门禁并携带真实版面预算、显式 targetChars 不再反向压下限、写作中证据耗尽工具层归一 terminal），
  并更新 3 个旧断言（默认区间改为由预算动态断言、布局物理上限 0.2442→0.26）。`npm run check`
  全绿（退出码 0）：629 个源文件全部 ≤250 行；Node/Renderer 双 typecheck；509 tests 中 507
  pass、2 个平台条件 skip、0 fail；Node build 与 Electron main/preload/renderer build 均成功。

**根因级修复（2026-08-17 13 时，真实 Electron 复测在证据耗尽后仍无限追加同一句，定位并修复）：**

- 现象：bl-7 尾行补长时模型反复输出同一句"并据此形成对稳定币资产配置价值的独立评估结论与配置建议"，
  自述"重复"却仍追加同一句，被 validator 拒绝后在低温下重试同一句，形成固定点死循环。
- 根因（不是缺守卫，是两处"必须继续写"语义制造死锁 + 一处状态推导盲区）：
  1. `system-prompt` 尾行门槛明令"**即使 availableEvidence 已为空，也必须用本条 bullet 已引用的证据改写
     补齐尾行，不得因'证据耗尽'放弃**"——证据耗尽时"不许重复/不许编造"与"必须产出文本"同时成立，
     合法内容集合为空，模型无解只能绕固定点；
  2. `instructionFor` 的 writing 分支在"no unused evidence remains"时仍指示 lengthen，tail 分支无
     证据耗尽出口，且 continuation 强制"never stop at needs_revision"；
  3. `workspace-status` 的耗尽→terminal 判定要求"非写作违规为空"——尾行违规（正是要补长的场景）属于
     非写作违规被排除，状态永远停在 needs_revision，永不 terminal。
- 修复（改语义与推导，**不新增任何守卫**）：
  1. `workspace-status.ts`：耗尽 + 未达标（欠填**或尾行违规**，排除 page_overflow——溢出靠 trim 修复
     不需要新素材）→ 立即 `needs_user_decision`；
  2. `diagnostics-projection.ts`：`instructionFor` 在 writing/needs_revision 分支最前面插入
     "素材已耗尽 → 立即停止一切 write_bullet/patch_resume_candidate，先调 inspect 完成最终校验收尾，
     如实说明缺口并引导用户补充素材"出口——耗尽状态下不再出现任何"继续补长"指令；
  3. `system-prompt.ts`：删除"证据为空也必须补齐尾行/不得因证据耗尽放弃"强制措辞，改为
     "耗尽且无法在不重复、不编造前提下补齐时立即停止补长，不得字面重复或强行追加同一内容"。
- 新增回归 2 个（尾行+耗尽→terminal；耗尽时指令必须先给停止出口而非补长指令）；更新既有
  "underfilled + 耗尽→terminal"仍通过。
- 验证：`npm run typecheck` 通过；511 tests 中 509 pass、2 平台 skip、0 fail；
  `desktop:build:protected` + `electron-builder --win --dir` 重建 `dist-electron/win-unpacked`
  （13:25）供真实 Electron 复测；未 commit/push/发版。

**真实复测仍失败 → 质检定位两个实现缺陷（2026-08-17 13-14 时，修复并跑通真实模型端到端）：**

- 现象：13:25 包复测仍循环且更差——bullets 写不进预览、一开始报 "This operation was aborted"。
- 质检定位（两个都是我此前的实现缺陷，非守卫问题）：
  1. `write_bullet` 动态默认下限把"预算行数 ÷ 容量 × cpl"当**写时拒绝线**（真实场景下限达
     149，容差后需 ≥119 字）——而模型自然产出是 60–90 字（此前真实实测早已证明），导致
     **每一轮写入都被打回**：预览永远空、模型重试 → 初始回合连续 8 次工具失败 → 取消；
  2. `agent-runtime-prompt` 初始回合被守卫取消后，0.84.2 的 `prompt()` 以 AbortError 退出，
     未按预期转入续跑而是把 "This operation was aborted" 直接抛给 UI。
- 修复（改语义，不新增守卫）：
  1. `write_bullet` 默认区间改为：下限 = 每行字符数（物理底线，≥1 行的 bullet 都接收），
     上限 = 单条物理上限；趋向 92% 的目标只由指令层（bulletCharTarget/system-prompt
     "宁长勿短"）引导，写时不再强拒短但合法的 bullet；
  2. `agent-runtime-prompt` 捕获初始回合的 AbortError（属预期路径），吞掉后继续
     waitForAgentIdle + 带全套守卫的续跑，不再抛给用户。
- 真实模型端到端质检（deepseek-v4-flash，`run-resume-agent-eval`）3/3 通过：
  - `semantic-zh`：6 条 bullet 全部写入、`ready_for_approval`、22s、0 报错；
  - `semantic-en`：4 条写入、`ready_for_approval`、14.5s；
  - `semantic-missing`：门禁拒绝建 workspace（容量 4 < 所需 5）、模型 8.6s 内主动追问补充
    素材（更多经历/项目细节/量化成果/技术栈）、无循环无编造无运行时报错；
  - 单测仍 509 pass / 2 skip；typecheck 通过。
- 产物：`dist-electron-v2/win-unpacked`（13:45，含全部修复；原 win-unpacked 被运行中的
  App 锁定无法覆盖）；未 commit/push/发版。

**第三轮根因修复：上下文压缩压瞎了"重新搜索"退出路径（2026-08-17 14 时，真实复测仍循环）**

- 现象：v2 包复测，模型已正确识别"素材不足、应扩大搜索"，但日志反复出现
  "由于所有工具结果都被压缩，我无法看到具体 ID"——`search_experiences` / `get_experience`
  的结果全部被上下文压缩成占位符，模型拿不到 Violin II 等经历 ID，陷入
  "搜索→被压缩→再搜索"的盲循环；循环文本复读触发复读守卫 abort，而续跑循环里的
  AbortError 未被接住，再次把 "This operation was aborted" 抛给用户。
- 根因：`context-policy.ts` 的压缩把**所有**发现类工具结果（含最新一次 search_experiences）
  替换为占位符。压缩本意是省 token，但"素材耗尽→用更宽条件重新搜索"是产品决策明确的
  退出路径，模型在该路径上必须看到最新搜索结果里的经历 ID。
- 修复（改语义，不新增守卫）：
  1. `context-policy.ts`：候选类工具仍只保留整体最新一次结果；**发现类工具（search_jds /
     get_jd / search_experiences / get_experience / inspect_resume_layout）每个保留最新
     一次结果**，只压更旧的——重新搜索路径恢复可见；
  2. `continuation-turn-timeout.ts`：续跑循环里守卫 abort 引发的 AbortError 属预期终止
     信号，吞掉后按"本轮结束"继续（下一轮读取 stoppedForOutputRepetition 做恢复/归一），
     不再抛给 UI。
- 回归测试：更新压缩测试为"旧结果压掉、每个发现工具的最新结果保留"；511 tests 中
  509 pass、2 skip、0 fail；typecheck 通过。
- 产物：`dist-electron-v3/win-unpacked`（13:55，含全部修复）；未 commit/push/发版。
- 质检边界说明：真实模型 eval（3/3 通过）覆盖门禁/写入/素材不足追问；本次压缩修复以
  单元回归 + 用户真实复测为准（eval 用例上下文短，不触发压缩）。

**第四轮根因修复：跨 bullet 重复校验误报锁死尾行修复（2026-08-17 14 时，经历充足场景仍循环）**

- 现象（真实日志取证）：页面 93.2%（在 [92,98] 内）、无溢出，唯一问题是 bl-0 尾行差
  20 字。模型每次补长都被拒，拒绝理由引用 bl-4 里"，完整呈现从行业背景到估值结论的
  研究闭环"——与本次操作内容无关；模型自己判断"这是持久误报"。修复 bl-3 重复结尾的
  操作同样被拒 → 任何 patch 都无法通过 → 永久锁死 → 输出退化成 "X → X - NO" 的
  自我否定重复。
- 根因：`evidence-single-operation.ts`（patch 路径）与 `bullet-validator.ts`（write
  路径）的跨 bullet 重复校验把**所有其他 bullet 拼接后整体查重**（
  `findRepeatedFragment([...strippedOthers, strippedMerged].join("\n"), 20)`）——
  只要任意两个"其他 bullet"之间存在 ≥20 字重复片段（经历多时非常常见：同经历素材写
  出的相近措辞、证据引用剥离失败残留），`findRepeatedFragment` 就会命中它并拒绝**本次
  操作**，哪怕本次操作与那个重复毫无关系。模型从此无法用任何后续操作修复既有重复
  （修哪条都被同一无关理由拒绝）→ 死锁。
- 修复（改校验语义，不新增守卫）：新增 `findNewCrossBulletRepeat(changedText, others,
  min)`——**只查"本次修改的文本"与其他文本的碰撞**（changedText 中的片段出现在任一
  other 里才拒绝）；其他文本之间既有的重复不阻塞本操作。patch 与 write 两条路径统一
  使用；真正由本次操作引入的碰撞仍被拒绝。
- 回归测试 2 个（patch：既有重复不阻塞无关 append、新碰撞仍拒绝；write：同语义）。
  513 tests 中 511 pass、2 skip、0 fail；typecheck 通过。
- 产物：`dist-electron-v4/win-unpacked`（14:30，含全部修复）；未 commit/push/发版。

**第五、六轮根因修复：技能区跨经历误拒 + 证据耗尽终态拍死补长阶段（2026-08-17 15 时）**

- 现象（真实日志）：b9（item-skills-synthetic）append 反复被拒（"引用了多个经历的证据"），
  模型改 replace_substring 后陷入"修订账目混乱"的大段重复推理。
- 根因 1（第五轮）：`resolveExcerpts` 的"证据必须单一经历"校验忽略 sharedEvidence——技能区
  bullet 创建时可跨经历（write 路径不走该校验），但之后任何 append/replace 走
  `resolveBindingWithAutoRepair` 就被拒，技能 bullet 变成不可修复 → 模型绕圈。
  修复：`resolveExcerpts(sharedEvidence)` 允许跨经历、`evidence-single-operation` 的
  sourceExperienceId 比对对 sharedEvidence bullet 豁免。
- 根因 2（第六轮，headless 真实模型质检定位）：证据耗尽 → 立即 `needs_user_decision` 的
  终态判定**拍死了补长阶段**——模型写完 17 条证据、页面 50%，补长（只用已引用证据、事实
  等价的局部修复）本来能把页面推到 92%，却被终态直接掐断。产品决策原文要求"当前内容
  **无法通过事实等价的局部修复达标**才终态"，该条件此前未实现。
  修复：新增 `maxReachableUsageRatio`（把所有 bullet 补长到单条最大行数后的页面占用率
  天花板）；证据耗尽 + 未达标时，**补长天花板 ≥ 最低占用率 → 继续写作循环并给"用已引用
  证据补长"指令**；天花板 < 最低占用率（数学上无路可走）→ 才立即 `needs_user_decision`。
  `instructionFor` 同步双分支。
- 质检（headless 真实模型 deepseek-v4-flash，用户形态 fixture：5 经历/17 证据，420s 墙钟）：
  修复前：写完 17 条即被终态掐断（50%），模型从未进入补长；修复后：**17 条写完 → 补长
  阶段正常执行 → usage 到达 92.0%**，全程无守卫触发、无重复、无停滞，仅在墙钟截断时做
  尾行收尾——证明"经历充足 → 写完 → 补长 → 达标"的完整链路可运行（非守卫终止）。
- 回归：新增技能区跨经历 append 测试；更新 4 个终态测试为补长天花板语义（无补长空间才
  terminal）；514 tests 中 512 pass、2 skip、0 fail；typecheck 通过。
- 产物：`dist-electron-v6/win-unpacked`（15:18，含全部修复）；未 commit/push/发版。

**后续固定实施顺序与完成门槛（2026-08-17 更新）：**

**S4.5.1 最新回归（2026-08-19，v100，未通过）：**课程已改为 Agent 提交原文引用、宿主逐项校验的
结构化识别；尾行改为每轮最多 8 条的单结果语义扩写，独立真实模型测试连续 3/3 通过。完整
`npm run check` 为 624 pass、2 skip、0 fail，696 个源文件满足行数门禁；Windows 加固包、安装与启动
门禁通过。但唯一一次自然语言整简历实测在 271.829 秒后仍剩 15 条短尾，终态为单页 92.59%、revision 11、
`needs_user_decision`，因此不构成稳定生成证据，S4.5.1 状态不变。完整数据、v97–v100 失败演进、哈希与
截图见 `S4.5.1-phase-driven-resume-generation.md` 阶段 30。本轮按要求已停，不再修改或重跑；未
commit/push/上传/发版。

**S4.5.1 最新独测（2026-08-19，system prompt v104，未通过）：**尾行模型合同已删除字符区间、固定
行数和候选，只保留 `currentText + expansionGoal + sourceQuotes` 的批量语义改写；合法 2→3 行增长可在
单页容量内先落地，全批次完整轮转三次零落地才暂停。真实 Chromium 独测从单页 94.73%、17 条短尾开始，
79.722 秒后降至 2 条，单页 97.64%、revision 6，全部经历 bullet 仍为 2–3 行；但最后两条在吸收全部来源
事实后跨到 3 行，尾行仅 23.8%/3.7%，继续扩写无事实可用，而当前绝对禁止缩短又拦住了压回 2 行的语义
重组，最终正确请求素材。完整 `npm run check` 为 626 pass、2 skip、0 fail，698 个源文件满足行数门禁。
报告见 `local-builds/tail-repair-eval/report-1787125237557.json` 与 S4.5.1 阶段 31。因独测未清零，本轮按约定
未打包、未跑整简历、未 commit/push/上传/发版，S4.5.1 状态不变。

**S4.5.1 最新独测（2026-08-19，system prompt v105，未通过）：**尾行修复已锁定当前实测行数，2 行
只能保持 2 行、3 行只能保持 3 行；统一 Renderer/CLI 测量把距离 70% 不超过一个中文全角字宽视为排版
容差内通过，其他质量门槛不变。完整 `npm run check` 为 628 pass、2 skip、0 fail，699 个源文件满足
行数门禁，真实 Renderer/PDF QA 通过。唯一一次真实 Chromium + LLM 独测耗时 105.093 秒，17 条短尾
降至 5 条，revision 1→6，单页使用率保持 94.73%，全部普通 bullet 始终为 2 行；但最终仍有
67.6%/67.6%/65.8%/64.0%/36.6% 五条未通过，并出现 1 次 malformed 参数与 2 次完全重复调用，终态为
`needs_user_decision`。报告见 `local-builds/tail-repair-eval/report-1787126655918.json` 与 S4.5.1 阶段 32。
因独测未清零，按用户确认的顺序未打包、未跑整简历、未 commit/push/上传/发版，S4.5.1 状态不变。

**S4.5.1 最新整份回归（2026-08-19，system prompt v112，未通过）：**模型侧字符目标和精准插入已从
深度、篇幅和尾行扩写中删除，只保留基于最新正文与来源的批量单稿语义扩写；Chromium/正式写入结果新增
逐 bullet 对账，正式内容校验拒绝不再伪报“已应用”。独立真实尾行测试已能 17→0；完整 `npm run check`
为 635 pass、2 skip、0 fail，700 个源文件满足行数门禁，Windows 加固包及隔离安装启动门禁通过。唯一
一次 v108 自然语言整份实测耗时 459.953 秒，全部 16 条普通 bullet 均为 2 行，单页使用率 92.59%，尾行
16→4、revision 20，但最后 4 条因模型重复已拒绝文本触发保护，`generationReady=false`。完整演进、产物
哈希与截图见 S4.5.1 阶段 33；本轮按用户要求已停止，不再修改或重跑。检查点提交为 `514858a`，阶段 33
后续改动未 commit/push/上传/发版，S4.5.1 状态不变。

**S4.5.1 最新整份回归（2026-08-19，system prompt v113 / temperature 0.3，未通过）：**尾行目标新增
最近两份拒绝稿的有限负向记忆、两级小批协议恢复、成功清账及独立 `model_protocol_stalled` 终态；拒绝稿
不落盘、不计正式进展，门槛未降低。完整 `npm run check` 为 641 pass、2 skip、0 fail，700 个源文件满足
行数门禁，Node/Electron production build 全绿。唯一一次 v109 自然语言整份实测证明 0.3 可被真实网关
接受，没有 temperature/schema 前置错误，但 600 秒仍未完成，随后被流式输出重复保护终止：revision 32、
单页 98.55%、剩 9 条 2 行短尾、60 次工具调用，`generationReady=false`。其中 4 条已真实走完两级协议恢复
并到 level 3，另外 5 条仍是语义失败/未完成项，故整体验证没有伪报 `model_protocol_stalled`；本次表现比
v108 更差，但单样本不足以归因温度。截图、尾行比率、状态核验和限制见 S4.5.1 阶段 34。未打包、未做
第二次生成、未 commit/push/上传/发版，S4.5.1 状态不变。

**S4.5.1 最新独测/整份回归（2026-08-19，system prompt v114 / temperature 0.1，整份未通过）：**协议
耗尽项现会从其余语义目标的 sweep 中隔离；剩余目标三轮零进展后可形成明确混合
`model_protocol_stalled`，不再要求所有失败同类。完整 `npm run check` 为 642 pass、2 skip、0 fail，
700 个源文件满足行数门禁。唯一一次独立真实尾行测试 82.861 秒通过，17→0、revision 1→7、单页
94.73%，8 次模型/8 次 apply，0 exact repeat/malformed/candidate，终态 `ready_for_approval`。随后唯一一次
v110 整份自然语言实测运行 241.355 秒，0 tool error，但在领域混合终态形成前被通用 turn governor 终止：
revision 10、单页 92.59%、尾行 16→11、26 个工具调用，`generationReady=false`。最终状态没有 level 3
协议耗尽项，故不能把失败归为混合判定错误；下一问题是通用 governor 早于正常领域恢复预算收口。报告、
截图、哈希和逐项状态见 S4.5.1 阶段 35。两个用户授权测试各执行一次且未重跑；未打包、未
commit/push/上传/发版，S4.5.1 状态不变。

**S4.5.1 最新实测（2026-08-19，尾行阶段预算换挡，独测/整份均未通过）：**普通生成继续使用原 40 轮
上限，首次进入 `batch_tail_repair` 获得一次最多 32 轮的尾行阶段预算，整次保留 72 轮绝对上限；同时裁掉
已完成的检索/初稿上下文。同结果、同 progress key、领域协议/语义停滞门禁和 temperature 0.1 均未改变。
`npm run check` 全绿：649 tests（647 pass、2 skip、0 fail），700 个源文件满足行数门禁，Node/Electron
production build 通过。但唯一一次独立真实尾行测试 142.064 秒仅从 17→2，最终为
`needs_user_decision`；唯一一次整份实测到 600 秒仍未完成，随后同一运行被通用 governor 终止，最终
revision 23、单页 92.59%、剩 10 条 2 行短尾、57 个工具调用且 0 tool error，`generationReady=false`。
阶段换挡解除 v110 的 241 秒过早停止，但尾行语义收敛仍不稳定，说明预算不是唯一根因。报告、截图、
哈希和尾行比率见 S4.5.1 阶段 36；两个授权额度均已使用且未重跑，未打包、未 commit/push/上传/发版，
当前版本不满足上线门禁，S4.5.1 状态不变。

**S4.5.1 最新实现（2026-08-19，system prompt v116，待真实复测）：**尾行第一层已简化为锁定
`currentText` 后只提交一个有来源 `growthText`，宿主确定性拼接；唯一一次 v115 独测 84.079 秒把
17 条短尾降至 3 条，但夹具中三条各自唯一的额外事实已经写入，仍剩 65.8%/67.6%/38.4%，随后模型
只能复述已写入事实，严格重复门禁正确拒绝。报告为
`local-builds/tail-repair-eval/report-1787141944362.json`。根因确认是 append-only 在事实有限时不可达，
不是温度、schema 或 Chromium 回执错误。经用户确认新增最多两次的 `batch_tail_reflow`：复用
`lineRewrites`，currentText 全部原字符必须按原顺序保留，只允许插入事实中性的定语、补语、连接语或
既有关系表达；正式事实/数字/重复/质量校验不变，且仅在保持原行数、尾行直接达标、单页无溢出时落地。
`npm run check` 全绿：634 tests（632 pass、2 skip、0 fail），705 个源文件满足行数门禁，Node/Electron
production build 通过。修复后尚未运行新的独立 LLM 或整份真实生成，未打包、未 commit/push/上传/发版，
通过一次独测和一次整份实测前 S4.5.1 状态不变。完整诊断和实现记录见 S4.5.1 阶段 37。

**S4.5.1 最新整份回归（2026-08-19，system prompt v116，未通过）：**按用户授权只执行一次当前
production build 的自然语言整份生成，没有独立短尾重跑或整份重试。运行 224.167 秒后正常结束，0
run/tool/schema/temperature error；revision 13、单页使用率 92.59%，16 条普通 bullet 全部为 2 行，
但排除技能项后仍有 13 条尾行低于 70%，`needs_user_decision`、`generationReady=false`，唯一 blocker
仍为 `layout_not_qualified`。新 `batch_tail_reflow` 已真实落地 1 条并使尾行 14→13，证明工具链可用；
其余候选多数因模型删换/改写原句字符而违反“全部原字符有序保留”合同，在 Chromium 前即被正式内容校验
拒绝，另有重复既有事实的候选。因此直接根因是严格逐字符插入合同与模型自然改写行为不匹配，不是温度、
布局回执或工具报错。截图为 `local-builds/v116/investor-research-run-30.png`，SHA-256
`F4E6EEB5C83EC5B265FF6D28FE549A30C2240534A0FB7EF0ED18AA994F8F8FFC`；完整终态与逐条比率见 S4.5.1
阶段 38。测试进程已全部关闭，未打包、未 commit/push/上传/发版，当前版本仍不满足上线门禁。

**0.1.19 发布前门禁（2026-08-19，本地 Windows 通过，跨平台发布待 CI）：**公网 Win/mac feed 当前均为
0.1.18，因此本轮升至 0.1.19，避免同版本不同密钥/哈希覆盖。生产依赖审计 0 漏洞；macOS 的原生模块
`signIgnore` 与 JIT/library-validation entitlements 保持不变。`npm run check` 全绿：634 tests（632 pass、
2 skip、0 fail），705 个源文件 ≤250 行；随后完整 `package:win` 重新生成随机密钥，Rust 3/3 tests、
ASAR/Fuses 加固审计、隔离安装真实 bootstrap、Renderer 存活和卸载清理全部通过。0.1.19 x64 NSIS 为
135,635,266 bytes，SHA-256 `C6A5530D544FB17D02DB5CC103B1EA81D4B75F67AC2B960D6E13B69C59178A14`，
仍为 NotSigned。用户已明确要求发布 Win/mac；后续必须经 PR 合入受保护 `app` 分支，并由 Windows/macOS
Actions 分别构建上传，不能在 Windows 上伪造 macOS 产物。完整本地证据见 S4.5.1 阶段 39；阶段 38 的
真实生成失败结论不变，打包通过不等于 S4.5.1 完成。

**0.1.19 跨平台发布进度（2026-08-19）：**PR #42 已合入 `app`。macOS workflow `32255120066` 在
5m46s 成功完成双架构 native、x64/arm64 ZIP+DMG、全架构 hardening 和服务器上传。首次 Windows
workflow `32255116143` 的 NSIS/hardening 通过，但安装进程在旧 10 秒窗口内未输出 bootstrap marker，
门禁正确阻止上传，Windows 公网 feed 暂留 0.1.18。验证器已改为 30 秒冷启动容差，并额外强制 CDP page、
marker、未退出和 3 秒持续健康；本地增强验证及完整 `npm run check` 均通过。修复 PR 与 Windows CI
重跑完成前，不得称 Win/mac 跨平台发布完成。完整记录见 S4.5.1 阶段 39。

**0.1.19 跨平台发布完成（2026-08-19）：**Windows 冷启动门禁修复 PR #43 已合入；只重跑 Windows，
没有重建已成功的同版本 macOS 包。Windows workflow `32256080004` 在 7m07s 完成 protected build、
NSIS、hardening、marker+CDP+持续健康安装验收、卸载及上传。公网 Win/mac feed 均为 0.1.19，下载页同时
提供 Windows、macOS Intel 与 Apple Silicon。五个公网文件均完成 HTTP 200、Content-Length、全字节
SHA-512 feed 匹配与独立 SHA-256 校验；Windows EXE SHA-256 为
`CA3F310FF09AB367701EA1B59218FB431C74672AD82776B37CE9C91F014F4F60`，其余四个 macOS 哈希见 S4.5.1
阶段 39及发布手册 10.8。Windows 仍 NotSigned，macOS 仍 ad-hoc/未 notarize。跨平台可下载已完成，但
阶段 38 的真实简历生成仍未达标，S4.5.1 状态不变。

| 顺序 | 状态 | 工作 | 完成门槛 |
| --- | --- | --- | --- |
| 1 | 已完成 | 把 `inspect_resume_layout.insufficient` 和可写容量升级为进入写作前的确定性门禁；不足时由 Agent 先扩大搜索，穷尽后返回 `needs_user_decision` | 不创建不可达 workspace；最终回复明确追问缺失事实；没有额外模型自循环 |
| 2 | 已完成 | 修正 `write_bullet` 的默认/显式 `targetChars` 语义，使首稿长度由本次真实 `requiredBulletLinesAtMinimum ÷ 可写 bullet 容量` 和尾行门槛动态给出；删除把 Agent 更高下限压回 75 的反向 clamp | 宿主只校验动态物理预算；不按类别分配内容；素材充足样本首稿接近 92%，不依赖大规模事后补长 |
| 3 | 已完成 | 把写作中”证据耗尽且仍不可达”设为立即 terminal；保留流式复读、turn governor、墙钟和次数守卫作为异常保险 | 正常素材不足路径为 `needs_user_decision`，守卫不再承担正常业务流控制 |
| 4 | 已完成 | 增加三组回归：规划前不可达、写作后实测不可达、充足材料可达；覆盖中文/英文、短标量、货币本地化和 terminal patch | 全部单测通过，业务源文件 ≤250 行，Node/Renderer typecheck、build 全绿 |
| 5 | 待验证 | 重新执行 `npm run check`（已绿）、`npm run package:win`，再用本地安装包进行真实 Electron 自然语言测试 | 素材不足样本在写作前追问；素材充足样本在 240 秒内达到 92%–98%、尾行/事实/数字/质量审查全通过并正常停机 |
| 6 | 待执行 | 将最终实测、失败和安装器 SHA-256 写回本节；清理测试临时诊断文件 | 不上传、不发版、不 commit/push；只有真实通过后才更新 S4.5 状态 |

**当前阶段结论：**写作前可达性门禁、动态首稿长度合同、写作中素材耗尽终态及三组回归均已有自动化
证据，`npm run check` 全绿；依赖补丁问题已通过升级 pi-agent-core/pi-ai 到 0.84.2 根除。S4.5
仍不得标记完成——唯一剩余主线是第 5 项：本地 `package:win` 后用真实 Electron 自然语言复测
（素材不足样本应写作前追问；素材充足样本首稿应接近 92% 且 240 秒内达标停机），通过后才更新
S4.5 状态与安装器 SHA-256；不得 commit/push/发版。

**跨阶段维护记录（2026-08-20，App 反馈入口）：**设置页新增轻量“帮助与反馈”入口，通过既有
`shell.openExternal` 在系统浏览器打开 Lark 问卷；App 不自动附带邮箱、简历或聊天内容。反馈文案已纳入
中英文目录与回归测试；`check:source-lines`、desktop typecheck、635 项测试（633 通过、2 项平台跳过）及
desktop production build 全部通过。该改动不新增 App 后端或数据库，未改变 S4.5 当前状态。

**0.1.20 发布前门禁（2026-08-20）：**本次发布仅包含设置页反馈入口、对应中英文文案/回归测试，
以及既有 Agent 协作规则文档；版本已从 0.1.19 升至 0.1.20，避免覆盖已发布随机密钥产物。npm 官方源
生产依赖审计为 0 漏洞；`npm run check` 全绿：706 个源文件满足 ≤250 行门禁，635 项测试中 633 通过、
2 项平台跳过，Node/Renderer typecheck 与双 production build 均通过。后续须经现有 PR #45 合入受保护
`app`，再按固定顺序执行 Windows、macOS 发布 workflow；两端上传与公网 feed 核验前不得称发布完成。

**0.1.20 跨平台发布完成（2026-08-20）：**PR #45 已合入受保护 `app`（merge
`2e8321a64af6007cc15c0a11e3fc8668267dda8a`）。Windows workflow
[`32285016195`](https://github.com/JsChen766/cv_agent_frontend/actions/runs/32285016195) 成功（7m29s），完成
Rust native 构建/3 项测试、protected desktop bundle、NSIS、release hardening、真实安装/bootstrap 持续健康、
卸载和上传；macOS workflow
[`32285771060`](https://github.com/JsChen766/cv_agent_frontend/actions/runs/32285771060) 成功（6m08s），完成
x64/arm64 native、universal protected bundle、ZIP/DMG、双架构 hardening 与上传。下载页 workflow
[`32286395278`](https://github.com/JsChen766/cv_agent_frontend/actions/runs/32286395278) 成功，公网
`latest.yml` / `latest-mac.yml` 和下载页均为 0.1.20。五个公网安装文件全部完成 HTTP 200、精确字节数、
feed SHA-512 与独立全字节 SHA-256 校验：Windows EXE
`4C0498533452384B15B6043EC49457342969FC57AF7A675BA48A1A804F84F876`，macOS Intel ZIP
`134FE2FD34F5D35CF8B77B1FA327787824E7B48623454845854BB41378FB6CF9`，macOS ARM64 ZIP
`4833CAEE80438E4053DEA549AC6B6CE5B211AFD55B2E8EFBC1EA691ADF907E5E`，macOS Intel DMG
`87DE0D41F1F76C7E67BC511941B0AF0C13F8B0CC836A4AA38AA99FC66AE628CB`，macOS ARM64 DMG
`5799A4A5F905A3EDD74B3F124E58771040D9705AB58764965FB6A612640AF967`。Windows 仍为 NotSigned，macOS
仍为 ad-hoc/未 notarize；S4.5 状态不因本次反馈入口发布而改变。

**0.1.21 跨平台发布完成（2026-08-31）：**远端 `三分之二+间距` 经发布准备 commit `e15ce70` 后由
PR [#47](https://github.com/JsChen766/cv_agent_frontend/pull/47) 合入受保护 `app`（merge
`49a672f11e75cdf603a5bcca4e5c664c74919f52`）；版本从已发布 0.1.20 升至 0.1.21。合并前清理了
2,056 个误提交的 `node_modules 2/` 文件、Finder 元数据差异和错误模板锁哈希，并用 LF attribute 修复
全新 Windows worktree 的模板字节门禁。npm 官方源生产依赖审计 0 漏洞；`npm run check` 全绿：984 个
源文件满足不超过 250 行，875 项测试中 873 通过、2 项 macOS-only 跳过、0 失败，双 typecheck 与双
production build 通过。Electron Resume Renderer/PDF、Agent Harness 16/16、Browser Agent 33/33、
AgentTasks UI 16/16 也通过。Windows workflow
[`33323011984`](https://github.com/JsChen766/cv_agent_frontend/actions/runs/33323011984) 成功（7m09s），
完成 Rust 3/3、NSIS、hardening、真实安装/bootstrap 持续健康、卸载和上传；macOS workflow
[`33323014006`](https://github.com/JsChen766/cv_agent_frontend/actions/runs/33323014006) 成功（5m17s），
完成 x64/arm64、ZIP/DMG、双架构 hardening 与上传；官网 workflow
[`33323401465`](https://github.com/JsChen766/cv_agent_frontend/actions/runs/33323401465) 成功。公网 feed、
下载页和官网 bundle 均为 0.1.21；五个安装文件已完整下载并确认字节数/feed SHA-512，独立 SHA-256：
Windows EXE `FA522E3A1D928666DFAF5138B6E442A20BB3FBF8C4CF8E2AFC5F3135182960F8`，Intel ZIP
`3DB9FF3AEB62FE717F6694D35D82EF81E046DC3877D6C8D9DD0F7FF6BB1C36AB`，ARM64 ZIP
`0CAF719B2833C3CD0EC67D629DFD8AC9D9604219F4EC28A94CEDD7FF9AFF68B4`，Intel DMG
`091D4DF09DD73C00BEC9E0C41C442B33504A9588B21CAC52105F877C1CA0FE79`，ARM64 DMG
`A329BF5EEBFD012E35BE05BF9F7CB93D67B6DCDEAFFEE78346C5652C106B6A92`。Windows 仍 NotSigned，macOS
仍为 ad-hoc/未 notarize；本次可下载发布不替代 BE5/BE8/S4.5 的真实账号、关联准确率、长期任务和生成
质量门禁，阶段状态不因此改变。Actions Node 20 弃用提示与官网 SSH shell quoting 警告留作独立维护项。

**0.1.22 ResumeDraft 会话关联发布完成（2026-08-31）：**远端 `Draft-编辑` 相对旧“三分之二”基线
实际只有提交 `c6dd8704`。为避免在仍处于质检的 Enhance 工作区或旧 0.1.20 分支树上操作，本轮从最新
`origin/app` 建立独立 worktree，只 cherry-pick 为 `1ea868c` 并升版 0.1.22；PR
[#49](https://github.com/JsChen766/cv_agent_frontend/pull/49) 合入受保护 `app`，merge
`4810bd4198962a6958c8216db9213a1915460bd3`。fresh worktree 首次模板门禁发现 LF attribute 与旧 CRLF
锁哈希不一致，修正 source-lock 为实际 LF `72a681...` / 5,562 bytes 后重跑通过。npm 官方源生产依赖
审计 0 漏洞；`npm run check`：991 个源文件均不超过 250 行，881 项测试中 879 通过、2 项平台跳过、
0 失败，双 typecheck 与双 production build 通过；定向回归 14/14。真实 Electron demo 验证了旧对话
保留、取消无副作用、确认后新对话为空且仍绑定同一 ResumeDraft，以及键盘焦点和 200% 缩放；Resume
Renderer/PDF QA 通过。Windows workflow
[`33379761238`](https://github.com/JsChen766/cv_agent_frontend/actions/runs/33379761238) 成功（8m40s），
macOS workflow [`33379765535`](https://github.com/JsChen766/cv_agent_frontend/actions/runs/33379765535) 成功
（5m17s），Homepage workflow
[`33380499079`](https://github.com/JsChen766/cv_agent_frontend/actions/runs/33380499079) 成功。公网 feed、下载页
和官网 bundle 均为 0.1.22；五个安装文件的字节数/feed SHA-512 全部匹配，独立 SHA-256：Windows EXE
`9AAAB20BEB0752F700CDC4E030122419D09BD15C81A10CA50FB5EDACF2DBFE73`，Intel ZIP
`D594B22D9E53334995012DFB33B6047A025D520755F60C1BBDB0E7FC14D1DAE3`，ARM64 ZIP
`9748B979ED98BDAD6C2F01D73633F58827F2C9A0AB304AEBC7EF6B861A2BA76A`，Intel DMG
`00070CB8D5861FFA13030BF856BB7B8B04CDA2BDC59CCD2C48FF0A3CE0ADB678`，ARM64 DMG
`B3937E27A92E177DE0FAECA50ABAA20B3228352F5E1F1A1F0AA81C7E346DE112`。Windows 仍 NotSigned，macOS
仍 ad-hoc/未 notarize；本次发布不替代 BE5/BE8/S4.5 的剩余真实门禁，阶段状态不因此改变。

**0.1.23 Browser Enhance 跨平台发布完成（2026-08-31）：**本地 enhance 先合入最新 `origin/app` 0.1.22，
保留 ResumeDraft 会话绑定、RunTerminal、AgentTask/Browser API 与本地加密存储；PR
[#51](https://github.com/JsChen766/cv_agent_frontend/pull/51) 合入受保护 `app`，merge
`138aec5c1aaf46f7e5f8d0dd4ef0572c9bc84759`。首轮 macOS run `33383248866` 在 native build 发现
macOS-only Rust 语法错误，Windows run `33383246087` 在上传前取消；PR
[#52](https://github.com/JsChen766/cv_agent_frontend/pull/52) 修复并合入最终 app
`38a813ef6604367cb26be418413956a3fc0454a6`。发布前 `npm run check`：1162 个源文件均 ≤250 行，1102 tests
为 1100 pass、2 platform skip、0 fail，双 typecheck、双 build 和 5 个 sandbox preload 门禁通过。
Windows workflow [`33383594280`](https://github.com/JsChen766/cv_agent_frontend/actions/runs/33383594280)、macOS
workflow [`33383597930`](https://github.com/JsChen766/cv_agent_frontend/actions/runs/33383597930) 与 Homepage
workflow [`33384212066`](https://github.com/JsChen766/cv_agent_frontend/actions/runs/33384212066) 均成功。公网
feed、下载页与官网 bundle 均为 0.1.23；五个文件全字节尺寸/feed SHA-512 匹配，独立 SHA-256：Windows EXE
`5CB39197513B4DA5E83B58A7F46B5218C40A5AA696014D7CE954880A4064376B`，Intel ZIP
`582B3508E93759B26A652C397F9C2399AA115E3729E396CAFC02D3321351DFFE`，ARM64 ZIP
`4F273493A978065D1497290F2CCC3649E6C2F2F64D2C0E38C9E4276AD53FCB8D`，Intel DMG
`0AF5C9F242B7FDE244EE4243425A125707F0D5172559373D79AEB2151717AF90`，ARM64 DMG
`E3EC3F964E191467ED9BE2472CFF54CB75F71098B4468FFE6828FDEA36652749`。Windows 仍 NotSigned，macOS 仍
ad-hoc/未 notarize；BSF5、BE6 真机和 BE8 真实交付门禁不因本次发布自动完成。

**0.1.24 Windows 启动热修复与跨平台发布完成（2026-08-31）：**0.1.23 在真实 Windows 更新后复现主进程
存活但无 Renderer/可见窗口；fresh userData 同样失败。启动 stderr 精确定位为
`TypeError: n.onSyncSettled is not a function`：合并后的 `registerAuthIpc` 调用遗漏 `BrowserWindow` 参数，
认证同步监听在 `loadFile` 前拒绝。修复同时把 Windows installer/unpacked 门禁从“bootstrap marker + 任意 CDP
page + 进程存活”收紧为必须加载 `file:` Renderer 且 stderr 不得出现未处理拒绝，并新增合同回归测试。发布前
`npm run check` 全绿：1163 个源文件均 ≤250 行，1107 tests 为 1105 pass、2 platform skip、0 fail，双
typecheck、双 production build 与 5 个 sandbox preload 门禁通过。PR
[#54](https://github.com/JsChen766/cv_agent_frontend/pull/54) 合入受保护 `app`，最终 app 为
`de2ccad067fb452e9780351a27816b1d4d26643b`；Windows workflow
[`33397416366`](https://github.com/JsChen766/cv_agent_frontend/actions/runs/33397416366)、macOS workflow
[`33397420925`](https://github.com/JsChen766/cv_agent_frontend/actions/runs/33397420925) 与 Homepage workflow
[`33398159448`](https://github.com/JsChen766/cv_agent_frontend/actions/runs/33398159448) 均成功。Windows CI 的真实安装
已通过非空 `file:` Renderer 与无未处理拒绝门禁；同一真实 Windows 覆盖安装后以既有 userData 启动，Renderer
存在且 UI Automation 确认主窗口非 offscreen。公网 feed 均为 0.1.24，五个文件全字节尺寸/feed SHA-512
匹配，独立 SHA-256：Windows EXE
`E31B366F2D8F66BB534244292B4971F4FEDE97B08383D0B59C7A1139B5D0338A`，Intel ZIP
`431F6769C917282B4455FAF292206E36E2F88A99AA6AB3ED5BF70CB723B3E315`，ARM64 ZIP
`BB05FC57FC42E275943C991A186C13F118EB3DAC0C050C2FE27A3D6447DEF588`，Intel DMG
`F2BE2C89F3624A51FFF2FE7F5187EA09BC160B5454117E2A81F2B5EF953131AE`，ARM64 DMG
`5269DDCE260D52731EF288D341C74EF649AEF8665595909119553BF1995216AD`。同机浏览器曾报 `Virus scan failed`，
但 Defender 对同一公网哈希文件直接扫描无威胁；Windows 仍 NotSigned，普遍下载信誉风险留待正式
Authenticode 证书解决。BSF5、BE6 与 BE8 状态不因本次热修复改变。

**S4.5.1 尾行 V2 实施与实测（2026-08-25 至 08-26，尾行独测通过、整份未完成）：**尾行质量政策已
从 layout manifest 解耦并版本化；新工作区采用严格 `2/3 + 1px` V2，历史无版本结构保留 V1。隐藏
Chromium 新增 computed-style CEU 标定和“水 × n”换行响应曲线，Agent 每条只提交一个 `growthText`、
每批最多 4 条，一次数字 CEU 修正后转 ordered reflow；没有候选、多模型或静态全字符表。Renderer/PDF
QA、722 文件行数门禁、Node/Preload/Vue typecheck、641 tests 和双 build 全绿。真实模型隔离测试分别
完成极短尾 17→0，以及 CEU growth 15→0（首次 60%、两次内 100%、平均 1.4 次）。本地 Electron
自然语言整份复测最终无 run error，但因真实素材在篇幅阶段连续两轮无法安全增高，停在 revision 8、
单页 90.91% 的 `needs_user_decision`，未产生可导出的合格 revision；因此只确认尾行子链路通过，
S4.5.1 与 S4.5 状态不变。详细证据写入 S4.5.1 阶段 38 后续记录；未 commit/push/package/发版。

**S4.5.1 无素材二次确认与中性尾行补齐（2026-08-26，独立真实 Electron 通过）：**新增两段明显追问，
两次“无可补充”必须来自不同用户消息；关键技能和最低 bullet 数不可绕过。授权后的有限中性短语只留在
当前 Resume，禁止数字、实体、工具、结果或因果主张，原事实仍按原 evidence 校验。真实
`deepseek-v4-flash` + Chromium 压力样本把 17 条极短尾全部清零：单页 94.61%、无溢出、最短尾行
71.3%、revision 3→8、17 条中性片段留痕、最终 `ready_for_approval`；报告为
`local-builds/tail-repair-eval/report-1787675960514.json`。完整 `npm run check` 通过：733 文件行数门禁、
645/645 tests、全部 typecheck/build。开发 App 已实际启动；跨重启旧草稿因临时 candidate 与 `exp_N`
引用失效不能续接确认，安全保留原草稿并报告失败，未把该恢复边界伪报为通过。依赖实体同时迁出 iCloud
Desktop 至标准 `~/Library/Caches/Coolto/**/node_modules`，连续门禁后 dataless=0。未 package、commit、
push、上传或发版；整份自然语言新建简历尚未重跑，因此 S4.5.1/S4.5 总状态暂不改为完成。

**S4.5.1 最新可见 App 简历复验（2026-08-26，通过）：**用户指出隔离样本并非界面最新产物后，已在
当前开发 App 内新建并完成真实简历 artifact `0be8b4fd-3679-4713-b590-38cb2556b0f1`。首轮重复保护
中断时仍有 14 条短尾，没有冒充完成；同一 workspace 续跑并真实显示两段明显追问，两次“没有可补充”
来自不同用户消息，确认工具成功后把 revision 11 的 12 条剩余短尾于 revision 16 全部清零。最终
`generationReady=true`、`ready_for_approval`、单页 92.37%、blocker 0、最短尾行 67.65%（严格大于
2/3），保存与导出按钮均已解锁。这次证据是用户界面中最新可见简历，而不是隔离测试报告；本地 App
保持启动。未 commit、push、package、上传或发版。

**S4.5.1 尾行完整语义改写替代中性补齐（2026-08-26，独立链路连续 3 次通过）：**用户判定固定中性
复核/跟踪尾缀不可接受后，模型可见工具面已移除 `confirm_no_resume_material`、`fact_neutral` 与
`tailGrowths`，改为每条最多两份完整事实等价 `tailRewrites`；允许重组语句，但事实、数字、专名、工具、
单页、≥92% 与 V2 三分之二门槛均不放宽。宿主先拒绝机械重复，再批量 Chromium 实测并确定性择优；合法
但尚未过线的候选只作临时工作基线，不污染正式 revision。最终同一版本连续三次真实
`deepseek-v4-flash` + Chromium 将 17 条极短尾全部清零，耗时 76.2/62.8/79.7 秒，0 重复、0 schema/
malformed，单页使用率均为 94.61%，报告为 `report-1787714165830.json`、
`report-1787714243027.json`、`report-1787714335246.json`；旧机械固定尾缀未再出现。Renderer/PDF QA
为单页 96.11%、最低尾行 76.79%；最终 `npm run check` 为 742 文件门禁、650/650 tests、全部
typecheck/build 通过。尚未完成用户 Codex 优质简历金标对照或自然语言整份 App 新建复验，故
S4.5.1/S4.5 状态不变；未 package、commit、push、上传或发版。

**S4.5.1 补材恢复与短尾绑定修复（2026-08-26，真实 App 进展至剩 1 条）：**输出重复恢复现已区分
`repeated_cycle` / `narrative_limit` 并强制首项输出为当前 nextAction 工具调用；Vue Resume/JD 引用在 IPC 前白名单
去代理化。经历短 ID 由顺序 `exp_N` 改为真实 ID 派生的跨重启稳定值，恢复草稿时先重建映射。更关键的是，
`tailRewrites` 现可从 `availableEvidence` 选择补充事实并用 `additionalEvidenceIds` 将其绑到正式 bullet；整页仍单页、
无溢出且≥92% 时，bullet 可自然增行，不再被旧“必须保持原行数”误杀。真实 11.62 MiB SiC PDF 在 Electron 中再次
完成选择、解析和补材，续跑期间未再出现模型输出停滞/重复或 IPC clone 错误；草稿短尾由 2 条降至 1 条并已接受为本地
修订。最后一条仍需用户确认本人参与的测算/交付事实，保存/导出仍正确禁用；因此不标记完成。完整 `npm run check` 为
744 个源文件、656/656 tests及全部 typecheck/build 通过。未 package、commit、push、上传或发版。

**S4.5.1 最终自然语言生成、补材与审批复验（2026-08-26，本轮范围通过）：**修复测试中的工具回执
`TextContent | ImageContent` 收窄后，审计额外发现并修复 Experience update 把本地专用
`resumeSectionKey/resumeSectionLabel` 发给后端的问题；失败经历通过真实 UI“重新应用本地修改”恢复为
`clean`，未另存重复实体。Agent 经历搜索不再暴露 `conflict/failed` 证据，未完成 Resume artifact 会在主进程
重启后恢复 workspace 与稳定短引用。只有 bullet 明确引用且归属同一经历的 supplemental evidence 才能支持新增数字，
Agent items、手动编辑与 candidate patch 均复用该门禁。

- 全新 Electron 对话只输入一句自然语言生成请求；首轮 176.489 秒，JD 一次搜索/一次读取、经历两次不同查询，
  0 tool error，单页 92.44%，在一条严格尾行缺口处正常追问。用户只补充 PDF 中可核验的两条 SiC 测算事实，
  48.706 秒内完成 `add_resume_material` 与正式 item 整合，页面升至 95.35%；正文同时保留
  `380/35/30/56/57` 亿元，并新增导电型 260 亿元、半绝缘型 120 亿元、新能源汽车 245 亿元、
  `6600/6300/6000/5500` 元/片与 `0.5/0.03/0.09/0.05` 片单台需求假设。
- 证据未进入正式正文的 revision 12 上，“保存到简历库/导出到本地文件”均真实禁用并显示对应 blocker；
  合格 revision 上两按钮均启用。用户表示暂时无更多事实后，一次成功展示 5 个岗位场景问题，未泄露
  `nextAction`、candidate、revision 或工具名；用户再回复“这些都没有”后才进入事实中性充实。
- 自动草稿 revision 19 达到 `ready_for_approval`、单页 95.35%、0 blocker，并自动弹出
  `resume.experience.sync` 卡；卡片直接提供“接受并执行/拒绝”，真实接受后 Experience 为 version 3、
  `clean`、Outbox=0，新事实全部存在于当前 revision。Smoke 同步支持开发版 localhost URL，并把这一宿主审批卡
  识别为合格终态，不再无意义等待 Assistant 文本。
- 最终内容金标复核拒绝了“从相关背景……完整语境出发”等机械前缀，并纠正“基准产品范围”、错误 VC 名称和
  超出来源的退出路径表述。事实中性候选改为在原事实分句间加入自然衔接，原字符顺序与事实不变；最终本地草稿
  revision 28 经真实 Chromium 为一页 95.35%、overflow=0、0 violations、最低尾行 67.65%，所有上述数字仍在，
  保存/导出真实启用。截图证据位于 `local-builds/final-e2e-20260826/`。
- 最终 `npm run check` 全绿：752 个业务源文件均 ≤250 行、669/669 tests、Node/Preload/Vue typecheck、
  Node build 与 Electron production build 通过。未 commit、push、package、上传或发版。用户明确列为后续的
  “同类型岗位复用一份满意基础简历再微调”仍未实现和验证；Section H 仍由专职测试人员执行，因此不把 S4.5
  总状态改写为全部完成。

**S4.5.1 内部过程隐藏与标准两端对齐（2026-08-26，真实 App 链路通过，目标草稿仍需补材）：**全新华泰
硬科技投资 JD 验收暴露模型在尾行阶段公开输出 `I need to / currentText / CJK / tailRewrites` 并在 6,000 字
保护后结束生成。现在实时模型正文完全不展示，历史协议叙述和权威补材问题前的内部前缀也由投影删除；
6,000 字保护只丢弃本次无工具响应并继续恢复，不再以固定三次结束，恢复请求和文本计划 follow-up 使用
`tool_choice=required` 强制先调用工具。单测连续 4 次 6,101 字符失控后第 5 次完成，0 失败事件、失控文本
未落入对话。真实 App 续跑只显示 92.5% 与短尾 6→4 等进度，最终将华泰草稿降至 3 条短尾并只显示
`【需要补充事实】`；当前保存/导出仍正确禁用。简历 bullet 同时改为标准两端对齐，最后一行自然结束且
V2 三分之二门槛不变；预览/测量/PDF 同源 QA 为单页 96.11%、最低尾行 76.79%、工作区 97.67%。最终
`npm run check` 为 752 文件、671/671 tests 和全部 typecheck/build 通过。未 package/commit/push/上传/发版，
S4.5.1/S4.5 状态不变。

**S4.5.1 工具执行结果回执（2026-08-26，真实 App 通过）：**内部过程隐藏后，孚腾资本真实对话中的“这些
都没有”和连续 LongBridge 文件修改请求因 Assistant 工具消息整体隐藏、临时进度结束清空而没有任何反馈。
现宿主在每个用户轮次结束后从工具结果与最终工作区生成持久化 Assistant 回执，并替换模型自拟总结；只有
`【需要补充事实】` / `【帮你一起回忆】` 权威问题原样保留。达标只显示“已全部达标，可以预览、保存和
导出”；未达标只说明自然语言缺口，禁止显示页面占比、尾行百分比、事实校验、JD 覆盖、revision、工具名或
门禁码。真实 App 未重新附加文件时正确显示“未提取到可安全写入内容、未修改、请确认附件”；再次确认无
补充事实后显示“不编造 + 已全部达标”，并展示经历同步审批卡。最终 `npm run check` 为 753 文件、677/677
tests 和全部 typecheck/build 通过。审批未代用户接受，未 package/commit/push/上传/发版，阶段状态不变。

**S4.5.1 JD 确认后的开始生成回执（2026-08-26，实现与回归通过）：**用户接受 `jd.save` 审批且原始意图
明确要求生成简历时，宿主立即显示并持久化“OK，已经确认要生成简历了，我现在开始生成。”，然后才运行
JD continuation；用户只回复“确认”时会沿用前一条生成意图，不需要再次确认。最近请求若明确“只保存/
不生成”或只做匹配则不显示。专用 `assistant.notice` 事件保证运行中的当前聊天即时可见，最终会话替换不会
重复。新增意图、持久化与 Renderer 合同回归后，`npm run check` 为 753 文件、682/682 tests 和全部
typecheck/build 通过；本轮没有新的待确认 JD 做真实接受回放，未 package/commit/push/上传/发版。

**S4.5.1 文件补材的经历仓库沉淀确认（2026-08-26，实现与回归通过）：**用户在修改简历时上传并说明属于
已有经历的报告、作品或其他材料，Agent 必须一次提取并加入其中全部可核验事实，尽量保留背景、职责、方法、
对象、数据、交付物与结果；一页简历只按当前岗位和版面择取部分内容，不能反向压缩经历仓库的长期证据。
`add_resume_material` 成功后，宿主不再等待简历达到交付门槛，而是立即复用 ApprovalCard 展示“将补充事实
同步到经历仓库”，完整预览拟追加内容并让用户整体接受或拒绝；拒绝只阻止经历仓库写入，当前本地简历草稿
仍保留材料。已有简历 AI 编辑分支也接入同一审批，纯 supplemental 变化会先持久化，不再因尚未选入 bullet
而丢失同步机会；同一 evidence fingerprint 仍只提示一次。`npm run check` 全绿：758 个业务源文件均
≤250 行、688/688 tests、Node/Preload/Vue typecheck、Node build 与 Electron production build 通过。
本轮未执行真实附件 + Electron 人工接受/拒绝验收，未 package/commit/push/上传/发版，阶段总状态不变。

**S4.5.1 用户指令优先与材料追问终止第一批（2026-08-27，真实 Electron 通过）：**主 system prompt
升级为 `coolto-local-agent/v131`，明确安全、权限、执行事实和运行保护范围内以用户当前明确指令为先；
可逆信息不足时自行判断，用户表示没有材料、停止追问、按现有信息继续或接受当前草稿后不得换一种说法
继续索取。场景回忆改为用户主动选择的 1–3 个问题；明确无材料可在同一消息解锁事实中性表达，不再要求
第二次确认。JD、浏览器写权限、AgentTask、补写审批、输出重复和 turn governor 的内部 continuation/recovery
提示同步收口，自动恢复本身不再制造材料问题。

- 复用现有 `decline_resume_material` 表达 `user_stopped_questions` / `best_effort_stalled`，没有既有
  material request 时也能保留当前最好草稿并进入 `stop_insufficient_material`；用户停止与运行保护停机
  使用不同可见回执，不冒充合格。首次真实实测发现模型会用纯文本口头确认停止却不调用工具，留下旧材料
  边界；随后基于 Pi Agent Core 原生 follow-up 和 `shouldStopAfterTurn` 修复：新产生的问题必须原样显示，
  既有材料边界的用户回答若未使用 add/confirm/decline 落地，会追加一次 `tool_choice=required` 内部续接，
  禁止纯文本假停机，没有增加第二套 Agent loop。
- 真实开发 Electron 重启后，新对话引用历史未完成“投行项目实习生”草稿，输入“没有任何补充，不要再问，
  也不要修改简历；请停止并保留当前草稿”。最终真实出现 2 项工具调用，并由宿主规范化为“已停止追问并
  保留当前草稿。由于现有事实不足，这份简历尚未达到交付门槛。”；继续等待 5 秒无自动 follow-up、无新问题，
  导航恢复可用，简历正文未修改。另一次场景实测命中历史草稿里持久化的旧 `scenario_probe` 与旧同步卡，
  已明确排除为污染样本且未操作审批，不作为通过证据。
- 最终 `npm run check` 全绿：889 个源文件均 ≤250 行、764/764 tests、Node/Preload/Vue typecheck、Node build
  与 Electron production build 通过，`git diff --check` 通过。用户已批准但依赖内容/交付策略的真实性覆盖、
  关键技能与 bullet 数放宽、任务级补写授权、缺失 Profile 继续、用户接受版本保存/导出仍保留为第二批，
  尚未开始。未 package、commit、push、上传或发版，阶段总状态不变。

**S4.5.1 材料三段闭环与最终尾行收尾（2026-08-27，自动门禁通过、真实 Electron 待验收）：**材料不足
不再直接进入重复追问或停止：Agent 必须先结合 JD、经历和短尾位置发起一次具体补充邀约；用户愿意时先
加入并正式整合全部新事实，整合后宿主固定显示 `【继续补充】` 再问一次；用户首次拒绝邀约或补充后表示
没有更多材料，均调用 `confirm_no_resume_material` 进入最终收尾，只有明确停止整份生成才使用
`decline_resume_material`。最终收尾保留 V2 三分之二门槛和 1px 几何容差，事实中性授权后尾行/篇幅/
深度尝试耗尽只轮换候选并继续真实 Chromium 校验，禁止重新生成材料问题，`pause_resume_for_material`
同时硬拒绝回问。候选池扩展为可轮换的多长度自然连接方案，无标点锚点时也能覆盖较大缺口；事实、数字、
专名、单页与 ≥92% 门禁不变。新增/更新回归覆盖首次邀约、补充后再次确认、无材料直接收尾、收尾耗尽后
不得回问、候选长度覆盖及既有 1px 门禁。`npm run check` 全绿：890 个源文件均 ≤250 行、766/766 tests、
全部 typecheck 与 Node/Electron build 通过。未做真实模型/Electron 端到端收尾，未 package/commit/push/
上传或发版，阶段总状态不变。

**S4.5.1 AI Builder 无补材三次真实回归（2026-08-27，0/3 未通过）：**用户明确排除一轮直接 JD reference
测试后，使用真实已登录账号和同一自然输入“请为岗位「AI Builder」生成针对性简历。”执行三次独立新
对话，并在首次材料边界统一回复“我没有任何要补充的，直接进入最后一个环节。”。第 1 次 47.077 秒在
邀约前因 workspace 后连续 12 次 `get_experience` 触发 governor，无 artifact；第 2 次先于 31.803 秒
给出具体 bullet 数量邀约，回复后 `confirm_no_resume_material` 被 `bullet_count_insufficient` 安全门拒绝，
续跑 106.164 秒后停在 revision 3、单页 78.10%、17 条短尾、最低 3.66%；第 3 次首轮 109.372 秒自行
best-effort 停止，回复后无素材授权成功，但 56.915 秒内 8 次 apply 只把页面从 72.14% 推到 76.51%，
随后 governor 中止，终态 revision 5、3 条短尾、最低 7.31%。三次均未达到 92%，没有真正进入最终尾行
批次，故不能把自动回归表述为真实收尾保证。根因收敛为：bullet 数量不足分支不能跳过补材、最终篇幅阶段
仍受通用无进展保护提前结束，以及一次创建后重复读取经历的 Agent 编排退化。截图与哈希记录在 S4.5.1
执行细则；未操作审批、保存或导出，未 package/commit/push/上传/发版，阶段总状态不变。

同日只读排查确认“历史好稿未复用”的直接根因不在 Agent 相似度判断：三次均调用了
`find_resume_reuse_candidates`，但真实账号当前有 46 条 `local_only` ResumeDraft、0 条 cloud Resume；
Reuse Memory 只读取已发布且 `qualityStatus=passed`、带来源 JD 的 cloud Resume，因此候选集合恒为空，
后续也从未调用 `get_resume` 或向 workspace 传 `baseResumeId`。成功的 AI Builder 本地稿
`07e029b8-d502-400a-b0f4-4c853b2e5e3f` 本身确为 revision 17、单页 92.78%、0 短尾、最低尾行
67.65%，但 `cloudState=local_only`、无 cloud link；同时 local draft 列表不投影来源 JD、generation
readiness、来源 Experience 或布局质量，Job Asset 只能显示“未关联 JD”。因此 UI 中“位于简历仓库”的
本地好稿并不属于当前 Reuse Memory 的候选域，每个新对话仍从空 skeleton 重新选择经历和写作，造成来源
集合漂移与模型结果波动。本轮未修改代码或用户资产，详细证据写入 S4.5.1，阶段状态不变。

问题已按同一 Reuse Memory 路径修复：候选现在同时包含 cloud passed Resume 与 local ready ResumeDraft；
本地候选要求全部门禁通过且没有 pending change，并带来源 JD/Experience 和内容指纹。Agent 用
`get_resume(artifactId)` 核验，同一 JD 默认选择最新合格本地稿，`create_resume_workspace` 通过新增的
`baseDraftArtifactId` 播种；宿主继续逐字重核当前 evidence、重算 coverage，不覆盖原稿。相同 JD 复用时
保留历史 item tier，新增经历才重新分级；合格 revision 现在也会幂等生成 generated checkpoint。完整
`npm run check` 全绿：893 个源文件、770/770 tests、全部 typecheck/build。真实 AI Builder 自然请求
25.534 秒内复用 `07e029b8-d502-400a-b0f4-4c853b2e5e3f` 的 7 条经历，新 artifact
`27b22c79-592a-4465-92b5-fc257c958e3d` 直接达到单页 92.78%、0 短尾、最低 67.65%、0 blocker 和
`ready_for_approval`；原 revision 17 基底不变。未 cloud write/保存/导出/package/commit/push/上传/发版，
阶段状态不变。

- 2026-08-28 根据真实泰康资产跨 JD 复用失败继续补齐完整快路径。候选检索新增按目标 requirement 权重
  计算的 `abilityOverlap/mustHaveOverlap`，仍只负责缩小候选并由同一个 Agent 读取完整 JD/Resume 后选择；
  没有增加规则模型或第二套 Agent loop。新工作区继续先建立目标 JD 框架，再按 section + Experience ID
  搬入 evidence/revision 仍完全一致的 grounded bullet，并在模板一致时保留原安全布局 tuning。
- 跨 JD 播种新增本地 `reuseAdaptation` 生命周期和 `reuse_adaptation_pending` readiness blocker；创建后
  `nextAction` 必须先进入 `adapt_reused_content`，只选择最高影响的一个非教育 item 做一次完整 items
  批量最小调整。真实内容未变化不能完成；完成前 bullet 数、篇幅、溢出、尾行、保存与导出均不能越级，
  完成后继续复用原有确定性门禁。相同 JD 合格基底不增加该阶段；当前 Experience 漂移时仍会丢弃失效
  bullet 并按真实缺口修复，不以“同 JD”绕过 evidence 重核。
- 同一真实用户轮次内，相同参数的 `get_experience` 只允许成功读取一次；交错的双 Experience 批次第二轮
  会被 `beforeToolCall` 拦截，新的真实用户消息会重置读取集合。草稿保存现在是继续模型循环前的强边界：
  新 candidate 保存时先清除旧右侧内容，保存成功即自动展开当前 Resume 预览；保存失败显示现有错误状态
  并抛出终止，不再让模型在没有 artifact 时继续。Pi 0.84.2 原生 listener settlement、beforeToolCall 和
  shouldStopAfterTurn 继续承担循环与事件顺序。
- 自动门禁新增/扩展跨 JD pending→真实内容变化→completed、同 JD直通、布局 tuning、能力重叠、交错重复
  读取、跨用户轮次重读和右侧交接合同；最终 `npm run check` 全绿：896 个业务源文件均 ≤250 行、
  774/774 tests、Node/Preload/Vue typecheck、Node build 与 Electron production build 全部通过，
  `git diff --check` 通过。
  真实 development Electron 使用已保存泰康 JD 和历史“投资实习生”本地基底（7 条经历）验证：新 artifact
  在约 23.4 秒内落盘并显示，初始单页 86.67% 且被适配 blocker 锁定；修正过严的多 item 适配后，唯一一次
  完整跨 JD 运行在约 185 秒达到 revision 5、单页 99.98%、0 blocker、0 短尾、
  `ready_for_approval`。另一次同 JD 复用因当前 evidence 重核丢失一条历史 bullet，120 秒内仍剩 1 条短尾，
  正确保持未达标；因此本轮证明跨 JD 快路径可完成，不把单样本扩大为所有 JD 的稳定性完成声明。
  本轮创建的 5 个 QA 对话和 4 份本地草稿已按精确 ID 删除，最终恢复 84 个原对话、49 份原草稿；未操作
  原泰康对话、历史基底、审批、云端保存或导出。未 package、commit、push、上传或发版，阶段总状态不变。
- 2026-08-28 使用用户提供的华泰联合证券“投资银行项目实习生”JD 做真实 development Electron 验收时，
  首轮发现 JD 审批可在原 prompt 尚未完成落盘时进入同一会话，`announceResumeGenerationStart` 因 Agent
  仍在运行而拒绝 `replaceMessages`。宿主新增按会话串行交接的 run gate：同会话审批排队到当前运行完整
  settlement 后接管，不同会话仍立即拒绝；覆盖同会话等待、顺序接管和跨会话拒绝的确定性回归。
- 第二轮已成功把历史基底显示在右侧，但模型又以完全相同参数创建工作区，被通用重复保护抢先终止。
  `create_resume_workspace` 现交回原有幂等/乐观锁领域恢复，unchanged 回执明确禁止再次创建并要求立即执行
  当前 `nextAction`；`adapt_reused_content` 同时成为上下文压缩的正式 continuation authority。跨 JD 适配也
  固定优先于后续补材问题。对 JD 的“办公常用工具/金融建模工具”与经历中的 `Microsoft Office/财务模型`
  增加保守直接同义证据匹配，避免已有可核验事实仍被误判为缺素材。
- 干净对话真实工具序列完成候选检索、`get_resume`、两次 Experience 检索、工作区创建和最小批量适配；
  右侧 blocker 由 `reuse_adaptation_pending` 正确转为页面 88.1% 与短尾，证明复用适配先完成。后续页面门禁
  通过、只剩 2 条短尾时选择“不补充新事实”进入事实中性收尾，最终单页覆盖 94.1%、最低尾行 66.7%
  （V2 硬门槛 2/3）、0 blocker，保存与导出按钮启用。高级详情的尾行目标不再硬编码 75%，改为展示该
  最低尾行实际 policy 的硬门槛。测试 JD 与最终本地草稿按用户要求保留，未执行保存到云端、导出、
  package、commit、push、上传或发版。最终 `npm run check` 全绿：897 个业务源文件均 ≤250 行、779/779
  tests、全部 typecheck/build 通过；阶段总状态不变。
- 2026-08-28 使用用户提供的腾讯游戏战投、AI×金融投研 Research Content Editor、广发证券投行三条
  JD 做零补材真实 development Electron 验收；仅接受必需的 JD 导入卡，未追加事实、文件或补写确认。
  结果为 **2/3 机器门槛可交付**：腾讯 63.674 秒达到 revision 1 / 单页 92.56% / 最低尾行 66.70% /
  JD coverage 2/6；广发 85.640 秒达到 revision 3 / 单页 94.09% / 最低尾行 70.75% / JD coverage
  1/6，二者保存/导出启用。Research Editor 在 184.954 秒停止于 revision 3 / 单页 81.95% / 最低尾行
  5.69% / JD coverage 0/5，仍有 6 条短尾、欠填和两段 main bullet 数不足，保存/导出禁用，故明确未完成。
  实测还暴露广发审批前内部编排旁白泄漏、两份成功稿缺少最终完成回执、Research Editor 运行中工具异常，
  以及“ready 但 JD coverage 很低、双语教育重复/跨岗位弱相关内容仍需人工检查”的质量缺口。完整 artifact、
  JD ID、时长与截图 SHA-256 已写入 S4.5.1；三条对话/JD/本地草稿保留供用户查看，未 cloud save、导出、
  修改业务代码、commit/push/package/上传/发版，S4.5.1/S4.5 总状态不变。
- Research Editor 同一草稿随后按用户“没有可以补充的了，你继续完成”复跑约 682.5 秒，复现十分钟无可见
  变化：1 次 `confirm_no_resume_material` 后连续 39 次 `apply_resume_content`，工具行全部显示 completed，
  但授权前后 11 条可见 bullet 完全一致，页面仍为 81.95%、最低尾行 5.69%、JD coverage 0/5；revision
  3→4 只来自无补材授权，不是正文进展。两个 main item（LongBridge、东吴证券）仍为 0 bullet。
  诊断确认不同 rejected error 集合持续改变 loop key，令无进展计数不能连续累积，直到 40-turn 上限；
  fact-neutral governor recovery 又强制继续写作，最终可见说明超过 6000 字才被 narrative guard 中止，
  并由后者掩盖前面的拒绝循环。此问题不是网关挂起或 Renderer 漏刷；完整代码边界、时间线和截图哈希已
  写入 S4.5.1。本轮仅诊断，未修改业务代码，阶段状态不变。
- Research Editor 首次生成无补材闭环已按用户定稿逻辑修复：空白稿低于 95% 时必须先消费可安全放入单页的
  grounded bullet；用户明确无更多材料后，清空旧重试状态、保留已验证的部分 item 写入，并将仅有 2 条真实
  bullet 的 main 降为 secondary，再只使用宿主白名单的句尾事实中性候选收尾。模型自拟“废话”不再进入
  中性测量；changing rejection errors 也不再被当作正式进展。最终 `npm run check` 为 901 文件、788/788
  tests、全部 typecheck/build 全绿。最新真实 development Electron artifact
  `883f5e98-0357-48a6-8b68-a24f4c0fa76b` 在用户确认无更多材料后 81 秒达到 revision 9 / 单页 96.92% /
  最低尾行 69.87% / overflow 0 / 0 violation / 0 blocker / `ready_for_approval`，保存与导出启用；截图 SHA-256
  为 `f6620c2e841df0b79afd58f42220e4b47ad909d3812409730900fa34503bb7b3`。未实际保存或导出，未 package、
  commit、push、上传或发版。JD coverage 仍为 0/5 且成稿保留部分中文字段，本场景机器门槛通过不代表出版级
  编辑质量或 S4.5.1/S4.5 全阶段完成。
- 用户随后确认“首次必须先有正文；无相关事实时允许跳过关键能力警告并继续到可导出”。空白 skeleton 不再
  被 bullet 数或 must-have 门禁提前暂停：首次回执先要求一次写完所有可用 grounded 正文，证据不足 item 也
  可保留逐条验证成功的中间正文，之后才提出补材问题。must-have 缺口改为显式可跳过 warning；用户授权后
  不编造该技能，warning 保留在工作区回执和最终反馈，但退出 save/PDF blocker。后续补入真实事实会撤销旧
  授权并重新计算。单个不足最低条数的弱 item 在首次生成跳过后由宿主删除并重新编译；历史复用不自动删段，
  本地复用来源也只读取最终可见 structure，不会把被删弱段带回；所有 item 都不足时仍 fail-closed。
  `npm run check` 全绿（912 文件、803/803 tests、全部 typecheck/build）；隔离真实 Electron renderer/PDF QA
  通过（单页 96.11%、最低尾行 76.79%、A4/字体/文本层/postflight/导出通过，截图无裁切或重叠）；
  `git diff --check` 因现有 Git pack `early EOF / far too short` 以 exit 139 失败，只读 `verify-pack` 判 bad，
  未擅自修复 Git 对象。未做真实模型 Electron 长链、cloud save、实际 PDF 导出、package/commit/push/发版，
  阶段总状态不变；完整实现与证据见 S4.5.1。
- 新增 JD 工具依赖体验修复：真实对话证实 `search_jds` 与
  `find_resume_reuse_candidates(targetJdId="__pending__")` 被模型同批并行提交；目标 JD 实际为本地
  `clean/upsert`、无 Outbox，后续真实 ID 全链成功，不是资产未保存。继续复用 Pi Core 0.84.2 原生 parallel
  loop 和 `afterToolCall`，仅把“同批搜索 + 占位 ID + 原调用失败”转换为非错误 `deferred_dependency`，下一
  模型轮使用 search 真实结果继续；工具 fast path 同时保证占位 ID 不进入 sync/JD Store，真实 UUID 缺失仍
  报错。Renderer 无新协议，标准 `tool.completed` 直接显示完成态，不再出现红色“工具调用出现问题”，prompt
  v138 同步禁止占位 ID。`npm run check` 全绿（913 文件、806/806 tests、全部 typecheck/build）；development
  Electron/CDP 复验因用户现有 preview 占用单实例而未
  产生 page，smoke 未发送消息或修改数据，精确实机模型分支待可独占实例时补验。完整证据见 S4.5.1。
- “写简历”真实运行中的 5 次 apply 被 UI 报为连续重复；诊断证明其中 4 次正式推进 revision 0→4，最终单页
  95.41%/26 bindings，只有 1 次 line expansion 未推进。实际循环在后续补材边界：模型把权威问题的 `“”`
  改成 `"`，两个宿主边界判断仍用整句 `includes()` 精确匹配，因而至少 12 次重复显示同一问题并持续注入
  internal follow-up，最后达到 governor 轮次上限；统一错误文案错误地归因于工具重复。本轮只诊断未修复，
  草稿和 `critical_skill/awaiting_response` 均保留，详细证据见 S4.5.1。
- 材料边界三项修复完成：成功 workspace 工具产生 `request_more_material` 后，产品 `shouldStopAfterTurn` 先于
  governor 立即停止；宿主直接按 request ID 追加唯一权威问题，不再让模型复述或用整句 `includes()` 判断；
  新边界文字 follow-up 已删除，旧边界用户回答仍由 add/confirm/decline 工具纠偏。Governor 按真实 reason
  区分相同结果、无正式进展、工具错误、轮次上限与模型中断。Prompt 升至 v139。`npm run check` 全绿
  （914 文件、810/810 tests、全部 typecheck/build）。真实 Electron 同 JD 运行最终无 runError、11 个工具全
  completed，但样本走 72.54% best-effort 路径而未命中引号边界；测试草稿/对话已精确删除，精确分支由完整
  Agent/宿主确定性回归覆盖。详细实现与验收边界见 S4.5.1。
- 2026-08-29 按用户确认的最小路线，将新 Resume workspace 的相关性主指标从固定 bullet 数切换为
  Experience 总正文行数：`main/secondary/utility` 只按 `3/2/1` 权重分配 `itemLineBudgets`，bullet 由独立
  工作/项目/报告数量决定，同一工作单元允许多 evidence 合并成一条长 bullet。继续使用一个自然语言 Agent、
  原三个工具、Pi 0.84.2 原生循环和原 Renderer/tail/save/PDF 链；旧草稿保留 legacy 条数兼容。
  `npm run check` 全绿（918 个业务/样式源文件均 ≤250 行、813/813 tests、全部 typecheck/build），
  `git diff --check` 通过。一次有效 development Electron 真实生成在 514 秒达到 revision 27、单页
  95.96%、0 violation、`ready_for_approval`，保存/导出启用；真实草稿包含 main 仅 2 条 bullet 但共 6 行，
  证明条数不再是相关性门槛。该次模型没有选中目标研究报告，且无补材收尾仍有重复连接语，因此只将 L1–L5
  标为完成、L6 标为“已执行但场景覆盖不完整”，不声明研究报告端到端问题已完全关闭。详细 artifact、行数
  和边界见 S4.5.1；未 cloud save、实际导出、package、commit/push、上传或发版，阶段总状态不变。
- 用户随后指定 YSL 护肤产品营销、复星财富战略投资、安克欧洲官网销售运营、申万策略、腾讯商业分析五份
  JD 做补充真实 Electron 单例。五份均走 `item-lines-v1`，但整份机器门槛只有安克 1/5 通过；YSL 86.83%、
  复星 77.75%、申万 89.53%、腾讯 71.86% 均正确禁用保存/导出。研究报告覆盖的三份中，复星和腾讯把 SiC
  与 Slack 两个独立报告各写一条，申万却把同一份《SiC 东风已来》的“报告/市场空间”与“建模参数/公司
  梳理”拆成两条，真实复现原问题，因此 L6 更新为未通过。安克虽达到 96.30%/最低尾行 70.39%/0 violation，
  但出现 14 个事实中性片段、模板化连接语、重复标点和删除来源“虚构”限定词，人工文字/事实验收不通过；
  腾讯持久化已在 188 秒失败收口，可见 UI 却继续停在检索状态数分钟，另暴露事件显示滞后。5 份测试 JD 与
  本地草稿保留，未保存 Resume 到云端、未实际导出或投递、未改业务代码、未 package/commit/push/发版；
  完整 ID、行数和终态见 S4.5.1，阶段总状态不变。
- 新生成 `resume-standard` 正文随后按用户要求由 9.75pt 调整为五号 10.5pt：只把新 skeleton 的
  `body_font_scale` 设为 `10.5/9.75`，旧草稿、模板 profile/source lock、sparse 模板与保存/PDF 合同不变。
  五号字体使旧容量 fixture 不再合格后，未降低任何质量阈值，而是把 Renderer QA 内容基线减至适合五号
  单页的 19 个 grounded bindings，并新增实测 14px 断言。最终 `npm run check` 全绿（918 文件、813/813
  tests、全部 typecheck/build）；真实 Chromium/PDF QA 为 14px、行高 16.52px、单页 92.98%、A4、字体/
  文本层和 G6 导出全部通过。未做新模型长链、package、commit/push/发版；完整证据见 S4.5.1。
- 2026-08-30 按用户确认新增“用户原文件投递资产”：PDF/DOCX 原始字节进入按账号隔离、safeStorage
  加密的本地仓库，使用 SHA-256 做完整性校验和重复导入去重；首份默认标星，重命名/默认选择只改元数据，
  外部源文件后续变化不会改变已保存副本。该资产不是 Resume、ResumeDraft、Experience 来源或
  `baseResumeId`，不进入 `list_resumes`、相关性、质量门、生成、修改或历史复用；用户明确指定后，Agent
  只调用独立选择工具并回复使用该文件投递，不继续写简历。
- 求职仓库“简历”视角新增独立“投递文件”分组、用户源文件筛选、详情、重命名/删除与“用于投递”；每个
  JD 详情均展示相同的全量本地投递文件并明确“与相关性无关”，不创建 `Resume.jdId` 或另一套简历关系。
  首次引导将“原样保存用于投递”和“解析经历用于写简历”拆成两个入口；只要已有投递文件，即跳过通用简历
  生成引导进入岗位链路。网页/Webmail 可通过宿主解析 file ID 并原样挂载，模型与 Renderer 永远拿不到路径，
  邮件发送仍由用户点击。
- 自动门禁覆盖不可变字节、格式/20MB、hash 去重、跨重启、默认切换、全岗位不过滤、工具隔离、路径隐藏、
  onboarding、投递文件筛选与清除本地数据；`npm run check` 全绿（955 个源文件均 ≤250 行、843/843 tests、Node/
  Preload/Vue typecheck、Node/Electron production build）。真实 development Electron 使用无用户数据的
  合成 PDF 验证系统选择器、独立分组/详情、两个不同 JD 的相同可用列表、窄窗口、用户源文件筛选和 200%
  缩放；未点击“用于投递”、未调用真实模型、未打开外部站点或发送邮件。合成文件与本地测试资产已清理，
  本地测试仓库移入废纸篓可恢复；未 package、commit、push、上传或发版，S4.5 总状态不变。
- 同日用户真实操作发现聊天回形针仍只能解析附件：根因是临时 `SelectedFileRegistry` 与持久投递文件仓库之间
  没有桥接写工具，附件 notice 也只声明了解析路径。现新增
  `save_selected_file_as_delivery_resume`，从用户本轮明确选择的 fileId 读取并再次验证原始字节，直接调用
  同一加密仓库的 `importContent`，保存后设为首选；“作为/保存为原始简历、源文件、投递文件、保持原样、
  不要修改”优先走该工具并硬禁 `parse_selected_file`、经历导入和全部写作工具。附件事件同步显示 `saved`。
  先以三个确定性失败锁定工具缺失、notice 误导和状态未完成，修复后专项 16/16 通过。完整重启后的真实
  development Electron 使用无用户数据 PDF 和自然指令“请把这个作为原始简历，保持原文件不做任何修改”
  直接回复已原样保存，可用于任意岗位；未进入解析、经历导入或生成。两条测试对话、PDF 和本地投递资产均
  已清理并移入废纸篓可恢复；邮件/外部站点未打开，未 package、commit、push、上传或发版。
- 随后用户真实文件再次出现“附件已失效或被替换”：桥接工具虽然存在，但 `SelectedFileRegistry` 只保存
  路径和 stat 身份，直到 Agent 工具执行才读取字节；系统临时路径回收、替换或文件物化会在选择与保存之间
  形成 TOCTOU 窗口。现改为选择时通过同一已打开文件句柄完成类型/20MB、前后 stat 和原始字节读取，注册表
  只保留不可变内存快照，后续解析和原样保存均返回副本，不再重新读取外部路径；会话删除、附件移除和账号
  清理仍释放快照。回归测试先稳定复现删除原路径后的同一错误，修复后验证路径删除及内容替换均继续使用
  选择时字节；附件专项 24/24、全量 852/852 tests、957 个源文件行数门禁、Node/Preload/Renderer
  typecheck、Node/Electron production build 与 `git diff --check` 全绿。未 package、commit、push 或发版。
- 用户随后确认原始简历应在“求职仓库 → 简历资产”中可见，但继续与 Resume 业务隔离，并且每个账号最多
  支持三份。Manifest 升级为 `delivery-resume-files-v2`，新增与 `preferred` 独立的稳定 `slot=1/2/3`：
  新 hash 占用最小空槽，第四份拒绝，重复 hash 不占槽，删除释放原槽且不重排其它编号；v1 按创建时间和
  ID 稳定迁移，历史超限项保留为 `slot=null`，不自动删除。Renderer 恢复独立“原始简历（N/3）”分组、
  `★1/★2/★3` 文本标识、当前首选、筛选、详情、重命名/删除/用于投递及 `delivery:<id>` 导航；达到三份
  只禁用新增。原始文件仍不进入 `JobRepositoryResume`、`list_resumes`、JD 关系、Application `resumeId`、
  生成、修改、质量门或历史复用。Agent 只按宿主 slot 报告编号和真实可见位置。专项 20/20、全量
  855/855 tests、957 个源文件行数门禁、Node/Preload/Renderer typecheck、Node/Electron production
  build 与 `git diff --check` 全绿；真实当前账号只读验证“添加原始简历（1/3）”、`★1` 列表、当前首选
  和详情均可访问，未新增、删除、改首选或投递。未 package、commit、push 或发版。
- 2026-08-30 按用户确认完成全账号一次性真实页面引导：新老账号只要没有当前版本完成记录，登录后即锁定
  普通导航并创建本机加密的“开始使用 Coolto”对话；每一步由用户点击同意，宿主把带“示例操作”标记的
  固定中英文消息写入真实对话历史，不调用 Agent/LLM、不消耗额度。Renderer 通过临时 Desktop API override
  让现有经历仓库、求职仓库、聊天/A4 与 Tracker 读取完全虚构的 Profile、3 条 Experience、Nova Labs JD、
  固定一页 Resume 和一条 Application；所有写 API fail-closed，样例从不进入 LocalSyncStore、Outbox 或云端。
  浏览器阶段使用真实 Browser Shell、受信任展示地址 `coolto://onboarding/example-application`、本地 data page、
  固定临时 PDF、既有字段写入与页内接受/拒绝 Overlay；没有外部站点、提交或邮箱扫描。审核结束后自动回到
  Tracker；完成动作先关闭浏览器并删除临时文件，再持久化 completed。真实 development Electron 在后端离线
  下从既有账号完整走通并重启复验：示例 Resume/Application 已从正式页面消失，临时目录无文件，引导对话保留，
  第二次启动不再强制出现。自动门禁 `npm run check` 全绿：973 个源文件均 ≤250 行、861/861 tests、Node/
  Preload/Renderer typecheck、Node/Electron production build 与 `git diff --check` 通过。当前 Browser Enhance BE5、
  S4.5 生成质量状态与邮箱/Calendar 路线均未改变；未 package、commit、push、上传或发版。
- 同日按用户确认收口首次体验与新对话入口：引导结束不再把粘贴 JD 与经历材料并列，而是先提示建立真实
  经历仓库；主操作清理示例后进入新的真实对话，上传文档、粘贴网页链接和直接讲述分别复用现有附件、
  Composer 草稿与 Agent 路径，“稍后再说”仍可只完成清理。只要 Experience 为空，即使已有原始投递文件也
  不再跳过经历沉淀入口。活跃求职空状态删除“准备面试问题”和“整理我的经历”两个泛化 prompt，改为同一行
  的“浏览求职网站 / 管理岗位与简历 / 查看投递进度”，点击直接进入既有 Browser、求职仓库与 Tracker，
  不创建聊天消息或调用模型。真实 development Electron 已确认三个入口可见且求职仓库导航生效；完整引导
  重放未再次执行。`npm run check` 全绿：977 个源文件均 ≤250 行、862/862 tests、Node/Preload/Renderer
  typecheck、Node/Electron production build 与 `git diff --check` 通过；未 package、commit、push、上传或发版。
- 同日用户进一步确认放弃独立 ExperienceEvidence，统一以 Experience 当前 revision 的长纯文本作为未来
  简历职业事实源。现新增宿主管理的材料沉淀状态机：PDF 保留页级边界，DOCX/TXT/Markdown 和当前网页按
  最多 6000 字分块，直接用户长文本走同一路径；材料正文最多 180,000 字，超过时明确要求拆分，不再沿用
  80,000 字静默截断。`begin_experience_material_ingestion` 固定材料快照并逐块返回全部数量短语、关键产出
  候选和最低详细度；`record_experience_material_chunk` 要求短块完整保留，长块至少达到原块 80%（上限
  5000 字），数字必须连同单位/限定词保留，报告、模型、系统、方案、论文、数据集、合同、营收、转化、
  结论等关键产出句的完整原始信息必须进入正文，否则宿主拒绝推进同一块。最低字符数只是防止过度压缩，
  不是 Agent 的总结目标；JD/岗位描述和原样投递文件明确排除在经历材料自动沉淀之外。
  多经历材料不会整份复制到每个 Experience：Agent 必须逐段提交相关的连续原文片段，宿主逐字验证片段
  确实存在于固定材料快照后才进入对应经历，避免串库和模型补造；直接聊天文本强制要求原文片段，
  不允许把“请保存/沉淀”等操作指令一并写入经历正文。
  全部分块通过后才一次合并为带材料标题/日期/页标签的正文块，经内部 Experience Proposal 自动进入
  LocalSyncStore/Outbox，并且每个目标 Experience 只创建一个 `source=import` revision；材料 hash 嵌入隐藏
  标记用于跨重启重复导入去重，Renderer 和简历 source snapshot 均过滤该标记。用户明确目标时直接关联，
  无可靠匹配时可自动创建新 Experience；一份材料涉及多段经历时逐段运行。现有简历补材也按 Experience
  分组自动追加正文，不再弹同步确认卡；旧 `prepare_experience_sync` 仅保留历史兼容。独立 Evidence 的
  App/Backend WIP 已从当前实现路线撤回，后端不需要新表或新同步实体。十页 PDF fixture 已验证 10 个页级
  分块全部接受前零写入、最后只提交一次；超过旧 80,000 字边界的长文本不截断，网页、直接文本、数字缺失、
  关键产出缺失、并发正文漂移、跨经历原文片段和重复材料均有回归测试。真实 development Electron 经干净
  重启后，以 QA Byte Lab「产品运营实习生」跑通直接文本：搜索 → 固定原文片段 → 宿主覆盖检查 → 自动
  Experience Proposal，最终新增 397 字、1 个分块、完整保留 6 个数量短语，当前版本显示来源“导入”；
  聊天操作指令未进入正文，内部材料指纹在当前正文和历史视图均不可见。再次发送同一材料返回
  `duplicate=true / addedCharacters=0`，没有产生第二个 revision。首次验收暴露的陈旧主进程工具与文本指令
  污染已通过干净重启和宿主强制 `selectedTexts` 修复；缺少片段现在返回可恢复回执而非可见工具异常，QA
  正文先恢复再以正确材料重跑。最终 `npm run check` 全绿：984 个源文件均 ≤250 行、875/875 tests、
  Node/Preload/Renderer typecheck、Node/Electron production
  build 与 `git diff --check` 通过。真实写入已进入 LocalSyncStore/Outbox；本轮后端离线，云端 replay 未复验，
  但没有新增或修改后端契约。未 package、commit、push、上传或发版。
- 2026-08-31 按用户确认补齐本地 ResumeDraft 与聊天的持续交互：Conversation 新增本地
  `activeResumeArtifactId`，宿主以幂等 Link Service 同时维护 ResumeDraft `conversationIds`，关系元数据不改
  Resume revision、正文或云端。点击侧栏本地简历会过滤已删除引用并进入最近更新的关联对话，Composer 持续
  携带精确 `artifactId`，不再依赖 `list_resumes` 猜测右侧内容；对话内“＋选择简历”也在真实 prompt 前补齐
  同一关系。新增“清空聊天上下文”采用非破坏性确认：底层创建消息数为 0 的新 Conversation 并继续绑定同一
  ResumeDraft，旧对话完整保留，右侧 A4 不变；全局“新对话”明确排除已绑定的空白会话并清除简历上下文。
  专项覆盖最近关联选择、单边/重复绑定、新会话零消息、旧消息保留、关系不制造 revision 与全局空白隔离；
  `npm run check` 全绿（991 个源文件均 ≤250 行、881/881 tests、Node/Preload/Renderer typecheck、Node 与
  Electron production build），`git diff --check` 通过。隔离真实 Electron production renderer + preload
  自动点击验收 9/9：原对话/上下文/A4 恢复、确认弹窗、新空白绑定对话、旧对话保留及全局新对话清理均通过；
  未调用模型、云端保存、正式用户数据、package、commit、push、上传或发版，BE5/S4.5 阶段总状态不变。

## 明确不进入本路线

- ResumeDraft/checkpoint 和用户原始投递文件的云端同步；
- Experience 归属于 JD/Resume/Application 的永久绑定；
- JD 或 Resume 自己保存第二套投递状态；
- 通用 FactBank、RAG/向量库、云端材料库、图片关联或原始文件上传；
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
