# P0：契约和回归基线

> 状态：已完成；简历 contract 由 P0-A 实施并通过自动化与真实服务双向验收  
> 前置：简历生成 G1–G7 已完成

## 目标

在增加 UI 和 Agent 工具前，冻结四条链路的共享契约、后端能力缺口、跨端兼容策略和回归样本。

## 实施内容

1. 建立当前能力矩阵，逐项记录 App、后端、Web 的已有 API、缺口和所有权；
2. 定义/复核 `SelectedFile`、`JdProposal`、`MatchReport` 和 `ResumeLibraryEntry`；
3. 固化 ID、hash、时间、分页、同步/并发冲突、幂等键和错误码规则；
4. 为现有 `/files`、`/product/jds`、`/product/resumes` 生成契约 fixtures；
5. 明确新增/修改后端 endpoint，避免在阶段中临时发明接口；
6. 建立 Web/App shared contract regression；
7. 记录基准测试：现有 App check、后端全量、Web resume layout 和 Electron QA。

## 已定稿契约决策

> 更新日期：2026-07-24；来源：与用户逐项确认 + 三仓库源码核对（cv-agent-app / cv-agent / cv_agent_frontend）。

- **Electron 文件句柄**：主进程持有绝对路径并注册到按登录用户/对话隔离的 SelectedFileRegistry，Renderer 只拿随机 ID、名称、类型、大小与状态；移除、对话销毁、退出登录时释放。
- **P1 解析与导入**：复用现有 App 本地解析和导入 Proposal，不调用后端 LangGraph 或 `/files` 上传链路。
- **JD 去重**：**P0 暂不实现**。后端 `create_jd` 明确无去重（每次新建行），App 侧也不做本地去重。`JdProposal.duplicateStatus` 字段保留但恒为 `none`，标注为后续能力，UI 不展示重复提示。
- **匹配报告（MatchReport）**：P0 **仅冻结本地 schema**；默认本地临时产物，云端 Artifact 保存推迟到 P3 或后续，不在 P0 定义云端存储契约或后端 endpoint。
- **云端简历删除**：**P0 暂不实现**。不新增 `DELETE /product/resumes/{id}`，也不用归档冒充删除。P4 UI 隐藏"删除云端简历"或标注"未接入"。后端 `ResumeStatus` 已含 `archived` 且 `PATCH` 可改 status，语义具备但 P0 不激活。
- **云端简历单版模型**：产品上每份云端 Resume 只有一份当前内容，不提供云端版本历史、版本回退或版本 diff。`ResumeVersionDiff` 不进入共享契约。
- **后端单文档重构**：原 staged/verify/accept、`activeVariantId` 和 `variants[]` 方案已废弃；后端、Web、App 按 [P0-A](../01a-p0-single-cloud-resume-rebuild/README.md) 直接切换到一份当前完整文档。
- **本地回退**：历史只存在加密 `ResumeDraftStore` 的不可变检查点中。恢复时复制为新本地工作头，不调用云端写入，不实现逐字或结构化 diff。
- **云端同步与冲突**：使用当前内容的 `ETag / contentHash` 做乐观并发控制，不保存或暴露版本。云端与本地都变化时必须显示冲突并让用户选择重读云端、另存为新 Resume 或明确覆盖；不以 diff 作为前置。
- **投递状态**：不进入 `ResumeStatus`，唯一来源是未来 `Application` 记录。

## 后端接口核对结果（2026-07-24）

在 `cv-agent`（后端）与 `cv_agent_frontend`（Web）实际源码核对后确认：

| 链路 | 现有后端接口 | 结论 |
| --- | --- | --- |
| Files | `POST /v1/files/upload`、`POST /v1/files/{id}/parse` | 已存在，P1 不动 |
| JD | `GET/POST/GET{id}/DELETE /product/jds`；含 `jdHash`、稳定 `requirement.id`、`v2Importance/v2Category` | CRUD 齐全；**无去重**（`service.py` 注释：always creates a new row），按决策 P0 不补 |
| Resume | `GET/POST/GET{id}/PUT/PATCH /product/resumes`，以及原子 `POST /resumes/publish`、`PUT /resumes/{id}/publish` | 已直接读写唯一完整文档；**无 `DELETE /product/resumes/{id}`**，按决策 P0 不补 |
| 当前云端内容 | 直接返回 `structured/contentHash` | 已删除 `activeVariantId`、`variants[]`、items 和 variant endpoint |

原结构性缺口已由 [P0-A](../01a-p0-single-cloud-resume-rebuild/README.md) 完成。JD 去重与
云端删除仍按用户决定推迟。

## 完成门槛

- 四个共享契约均有 TypeScript/Python schema 或明确的只读 projection；
- `ResumeLibraryEntry` 只暴露云端当前内容、本地草稿关联、同步状态与可执行操作，不定义 `ResumeVersionDiff`；
- 简历 contract 完成 P0-A 单文档重构，不保留旧数据读取或旧 API 兼容；
- Web Agent 与 App Agent 的已有功能均通过回归门禁；
- 变更只移除云端 variant 概念，不削弱既有生成、编辑、审批、预览或导出能力；
- 三个仓库基线全部通过并记录结果。

## 补齐记录（2026-07-24）

原始实施仅完成了 `SelectedFile` 契约定义。以下三个共享契约在后续补齐：

| 契约 | 文件 | 说明 |
| --- | --- | --- |
| `JdProposal` | `src/jd/types.ts` | 本地不可变提案、`JdProposalRequirement`（无服务端 ID）、`JdDuplicateStatus`（P0 恒为 `none`）、`JdSaveApprovalPayload` |
| `MatchReport` | `src/match/types.ts` | 四维固定权重评分、亮点证据、缺口与建议、来源引用和过期标记；仅本地 schema，云端保存推迟 |
| `ResumeLibraryEntry` | `src/resume/library/types.ts` | 云端当前内容摘要 + 本地草稿摘要 + 同步状态 + 可执行操作列表；不定义 `ResumeVersionDiff` |

补齐后 `npm run typecheck` 通过，未改动既有代码。
