# P0 产品范围与架构

> 状态：已固化为实施基线  
> 日期：2026-07-24

## 1. 目标与边界

本路线不是重写现有 App，也不替换简历生成 G1–G7。它在现有 Electron + Vue + 本地 Pi Agent
架构上补齐四条缺失链路，并复用同一个后端、账号和固定资产数据库。

### 范围内

- PDF、DOCX、Markdown、TXT 简历附件的系统选择、受控注册和状态展示；
- 复用 App 已有本地解析器，把简历文件解析为经历候选并经用户确认入库；
- 对话中粘贴 JD 原文，提取结构、预览并确认写入；P0 不做 JD 去重；
- 按 PRD 固定权重生成结构化岗位匹配报告；
- 云端简历仓库、当前内容查看、重命名、继续编辑、归档/恢复归档、本地草稿删除、本地检查点回退和同步冲突处理；
- 从上述链路进入既有 G1–G7 简历生成、保存和 PDF 导出。

### 范围外

- JD URL 抓取、网页 DOM 读取和自动填表；
- 邮箱授权、邮件草稿和实际发送；
- 投递追踪看板、面试提醒和确认邮件扫描；
- 通用材料库、图片附件、素材与经历关联；
- 图片 OCR；
- App 调用后端 LangGraph；
- Web 与 App 聊天记录同步。
- 云端 Resume 删除 endpoint 和用户可见删除操作；P0 只支持归档/恢复归档。

## 2. 当前能力差距

| 能力 | 可复用 | 本路线需补齐 |
| --- | --- | --- |
| Web 简历上传 | Web 已有文件选择、`/files/upload`、`/parse`、后端导入图和候选确认 | 本路线不重做 |
| App Core/CLI 导入 | 已有 `--attach`、SelectedFileRegistry、本地解析、导入 Proposal 与 Executor | 本路线不重做 |
| Electron 桌面入口 | P1 已完成系统选择器、对话级 SelectedFileRegistry、附件条和 App Agent 接线 | 后续阶段只做回归，不再建立第二套附件链路 |
| JD | 后端已有 create/list/get/delete API（create 无去重）；App 已有 list/get | App create Adapter、提取 Proposal、审批执行、UI；去重 P0 暂不做 |
| 匹配分析 | 后端 Agent 有 match report，但与 App Agent 独立；G1–G7 有 JD requirement/evidence | App 本地结构化分析器、固定评分器、报告 UI、语义评测（仅本地 schema，云端保存推迟） |
| 简历 | P0-A 已完成单文档 `GET/POST/PUT/PATCH` 与原子 publish；Resume 直接持有 `structured/contentHash`；重命名/归档（PATCH status）可用，无 DELETE | 仓库 UI、当前云端文档投影、本地草稿合并和基于 `contentHash` 的同步冲突；云端删除 P0 暂不做 |

后端 Agent 的现有生成代码只能作为字段语义和测试样本参考，不能由 App 直接调用，也不能作为
App 功能已经完成的依据。

## 3. 数据权威与生命周期

```text
用户选择的本地简历文件
  └─ 本地临时 SelectedFile（不自动上传）
       └─ App 本地解析结果
            └─ ExperienceImportProposal
                 └─ 用户批准后写入 Cloud Experience

粘贴 JD
  └─ Local JdProposal（临时）
       └─ 用户批准
            └─ Cloud JdRecord（固定资产）

匹配分析
  └─ Local MatchReport（默认临时）
       └─ 用户明确保存时才成为 Cloud Artifact

简历草稿
  └─ LocalResumeDraft
       └─ 用户批准保存
            └─ Cloud Resume 当前内容
```

### 3.1 唯一权威来源

- `Experience`、`JdRecord` 和 Resume 当前内容以云端为准；
- 本地 Proposal、文件解析文本、匹配报告草稿和 ResumeDraft 不与 Web 同步；
- App 不直接连接数据库，只调用业务 API；
- 所有云端写入后重新读取服务端返回值，不把本地请求体当作已保存结果。

### 3.2 云端简历与本地历史

- 产品上每份云端 Resume 只有当前内容，不提供云端版本列表、版本回退或 diff；
- 后端 `Resume` 直接持有唯一 `structured`、`contentHash`、schema 与当前质量结果；原子
  create/replace 在质量门通过后一次写入当前文档；
- App 与 Web 使用同一个 `CloudResume` contract，读取时不做 active/published/first
  variant fallback；
- 历史只存于按用户隔离的本地 `ResumeDraftStore` 检查点。恢复检查点会创建新的本地工作头，不写云端，不计算 diff；
- `ResumeDraftCloudLink.contentHash` 记录上次同步的云端当前内容指纹，
  `syncedRevision` 只记录与它对应的本地工作区修订；二者都不代表云端版本。本地与云端都变化
  时，必须显示冲突并要求用户选择重读、另存新 Resume 或明确覆盖。

### 3.3 桌面 SelectedFile

桌面 App 复用现有 SelectedFile 和本地解析契约，不为简历导入建立第二套云端文件格式：

- Electron 系统选择器负责产生受控文件句柄；
- 主进程注册文件并只向 Renderer 暴露随机 ID、文件名、类型、大小和状态；
- App Agent 通过现有 `list_selected_files` / `parse_selected_file` 读取；
- 经历候选继续进入现有 `prepare_experience_import` 和宿主 Executor；
- 原始简历文件默认不上传云端。若未来要保留原件或关联通用材料，进入独立材料管理路线。

Web 端现有 `/files/upload`、`/files/{id}/parse` 和后端导入图保持不变；App 不调用该 LangGraph
链路，也不需要为了启用桌面回形针而重建它。

### 3.4 MatchReport

匹配报告默认是本地临时产物，不自动写入数据库。其结构至少包含：

- JD ID、hash、requirement IDs；
- 使用的经历 ID、current revision ID 与内容 hash；
- 四维分数、固定权重和最终分数；
- 3–5 条亮点匹配及其 JD/经历证据；
- 能力缺口、重要程度与诚实建议；
- 覆盖率、证据完整性、模型和评分器版本；
- `generatedAt` 和是否已过期。

来源 JD 或经历 revision 改变后，旧报告仍可查看，但必须显示“来源已变化”，不能继续作为最新结论。

## 4. Agent 与执行边界

### 4.1 App Agent

App 继续使用单个本地 Pi Agent。它可以：

- 读取用户明确选择的文件；
- 提取 JD 和匹配分析的结构化候选；
- 调用只读固定资产工具；
- 创建不可变 Proposal；
- 在用户批准后由宿主 Executor 执行云端写入。

它不能直接访问任意路径、数据库或后端 LangGraph，也不能自行把“已生成”说成“已保存”。

### 4.2 写入模式

所有写入统一采用：

```text
read latest
→ prepare immutable proposal
→ host shows preview
→ user accept / reject / custom revision
→ executor writes exact approved payload
→ server validates and returns current asset
→ App refreshes view
```

重命名可使用轻量确认；上传、批量导入、覆盖、归档和删除必须显示影响范围。删除属于 destructive，
不得与普通保存共用一个含糊按钮。

## 5. 安全与失败策略

- Renderer 永远不获取原始本地绝对路径；只持有受控 file ID 和元数据；
- 文件必须由系统选择器产生，校验扩展名、类型、大小和必要的内容签名；
- 文件文本、JD 原文和网页式内容都视为不可信数据，不能覆盖系统规则；
- 解析失败不影响本地文件，经历部分写入必须逐项报告且可精确重试；
- 写入使用幂等键；网络超时后先查状态，不能盲目重复创建；
- 来源版本冲突时重新读取并要求用户确认，不静默覆盖；
- 退出登录立即清除内存中的固定资产和未完成文件句柄；本地私有草稿仍按用户隔离加密。

## 6. 跨端一致性

- 新增后端字段必须向后兼容 Web；P1 原则上不需要修改后端文件上传或导入图；
- App 与 Web 直接共用后端 Resume 当前文档中的 snake_case `structured`，不翻译成第二套
  云端格式；
- JD requirement 和经历 revision 使用服务端稳定 ID；
- P0-A 已用公开 API 和真实客户端链路验证 App 写入后 Web 可读、Web 修改后 App 刷新可见，
  并验证过期 `contentHash` 返回 `409`；P5 在完整 UI 主路径中复验该能力；
- App 本地匹配算法可以与后端 Agent 不同，但保存的固定资产必须满足相同 schema 和后端校验。

## 7. 非上帝类约束

- API transport、Normalizer、Repository、Proposal、Executor、领域校验、Vue 状态和展示组件分文件；
- Electron 系统选择器不得写进 Agent 工具或 Vue 组件；
- 匹配评分器、证据验证器、报告生成器和 UI projection 分离；
- 简历仓库列表、当前内容详情、本地检查点、同步冲突和 Canvas 编辑分别管理状态；
- 新业务文件目标不超过 220 行，250 行为硬上限；测试 fixture 可例外但仍需按领域拆分。
