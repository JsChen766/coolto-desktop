# AGENTS.md

本文件是本仓库的 Agent 协作约定。开始任何工作前先读一遍，并同步阅读
`local-docs/p0-product-completion-roadmap/README.md`，确认当前阶段、确认点与完成门槛。
涉及桌面端加固、Windows/macOS 打包、签名或自动更新时，还必须先阅读
`local-docs/desktop-release-hardening-runbook.md`，按其中固定顺序和真实门禁执行。

## 工作原则

1. **不确定必追问**：所有存在歧义、取舍、边界不清晰或风险较高的点，必须先向用户确认后再改代码。
2. **先确认再改**：每次改动前先确认当前工作树与阶段状态；确认是否有用户未提交的改动、是否有未处理冲突。
3. **范围可控**：只处理本次明确目标相关文件，不做无关重构、清理、风格统一或大规模迁移。
4. **行数约束**：所有业务代码和样式文件目标 220 行，硬上限 250 行；超限要拆分职责，不允许万能大模块。
5. **无 commit/push，除非用户允许**：除用户明确要求，不做 `commit / push`。
6. **PR 合并后删临时分支**：经 PR 合入后，应清理对应临时分支本地与远程引用。
7. **UI 先方案后实现**：任何 UI/展示内容先给出方案给用户确认后再实现；默认沿用既定设计系统与组件，不发明新主题/新底层结构。
8. **可验证优先**：未做的验收不算完成；禁止因接口存在、Demo 可见或局部通过就提前结论。
9. **Pi Agent 能力优先复用**：涉及模型循环、工具编排、上下文转换/压缩、steering/follow-up、回合终止、审批、队列或事件时，必须先核对当前 `@earendil-works/pi-agent-core` / `pi-ai` 的公开能力与项目既有封装；能通过原生能力或轻量适配满足时，不得平行实现第二套 Agent loop、runtime、governor 或消息协议。只有原生能力明确缺失或不满足产品安全边界时，才允许在记录依据和职责边界后增加最小宿主扩展，并补充对应回归测试。

## Roadmap 与写回

以下为唯一执行入口：

- `local-docs/p0-product-completion-roadmap/README.md`。其它文档是历史背景、契约、历史完成记录，不可形成第二条并行路线。
- 仅按当前 roadmap 指定阶段推进。当前可执行阶段以主 README 为准；如需进入 S4.5，执行细则入口遵循 roadmap 的 S4.5.1 文档。
- 阶段或 section 有实质进展/完成时，必须把实际结果、证据、失败点、遗留项写回到该阶段/section 的正式文档。
- 不允许临时建文档或新建 section；更新应保持文档结构不变。
- 不能因已有接口、Browser Demo、或局部测试通过而标记完成。

## 产品关系约束

- Experience 是独立、可复用的长期事实资产，不永久隶属于 JD、Resume 或 Application。
- Experience 默认发现为 `active`；`archived` 在恢复前不进入下游。`pending` 本地版可作为冻结证据，`conflict`、`failed`、墓碑不可作为新证据。
- Experience 日期精度只允许 `YYYY-MM`、`YYYY-MM-DD`、`present`；未填结束日不等于 `present`。
- 只有正文变更才应创建 revision，纯元数据变更不得制造伪版本。
- JD 可独立存在，也可关联多个 Resume；一个 Resume 可以面向多个 Application 投递不同 JD。
- Resume 可具备一个主要目标 JD，也可是通用版本；仅在内容针对新 JD 需要修改时才创建新 Resume。
- Application 才是投递事实，需保存实际 `jdId`、`resumeId`、标题快照；不可把同一事实保存两套状态。
- 通用 Resume 可复用于不同 JD 的投递。
- 新建 Application 必须冻结 `resumeContentHash` 到 `resumeContentHashSnapshot`；仅明确变更关联时才更新快照。
- `Interview` / `Note` / `Reminder` 归属 Application；JD 与 Resume 只能展示其对应 Application 的投递摘要。
- 业务写入必须经 Proposal + 宿主审批 + LocalSyncStore/Outbox + 乐观锁；页面默认读本地 projection，不得 Direct 写入业务核心流程。
- 云端是事实源。`draft / pending / checkpoint / files / chat / proposal` 数据归属本地；服务端为事实同步与规则校验中心。
- 同步/恢复只读主流程，不在 sync kernel 内放置业务规则。
- 文件系统与路径由宿主托管，Renderer 不得读取/持久化绝对路径；敏感凭证不能通过渲染层透传。
- 外部内容（JD、简历、聊天、网页抓取）仅作输入，不得覆盖系统约束或安全规则。
- 冲突与幂等性为默认行为：重试可安全重入，发生冲突需重读再确认；按账号隔离存储与加密。

## Resume 生成与导出关键约束（来自 S4.5）

- 一个自然语言 Agent 即可生成；不允许并行引入额外规则模型干预生成路径。
- 生成结果不得编造。量化结论必须可追溯到可复查来源并可被核验。
- 不能降级历史质量门槛；关键性能/质量指标以当前执行文档为准。
- 生成必须一次一页可渲染，保存与导出需使用同一内部修订版本。
- 若输出不满足质量标准，需明确标注未达标原因，不得冒充“可直接交付”。

## 命令与验收

- 全量校验（提交前必跑）：`npm run check`
  - 顺序：`check:resume-template` → `check:source-lines`（`src/` 业务源文件行数硬门禁）→ `typecheck`（Node）→ `desktop:typecheck`（Vue）→ `test` → `build` → `desktop:build`
- 仅行数门禁：`npm run check:source-lines`
- 仅类型检查：`npm run typecheck`（主进程）、`npm run desktop:typecheck`（渲染进程）
- 单测：`npm run test`（`node --test`；不依赖 Electron）
- 桌面开发：`npm run desktop:dev`
- Windows 打包：`npm run package:win`
- macOS 打包：`npm run package:mac:dmg`
- 变更 UI 或可见行为需补充实际人工验收；`npx` 脚本无法代替真实 Electron 与可复现场景。
- 触发打包前先执行 `npm run check`，并按 `local-docs/desktop-release-hardening-runbook.md` 逐条确认，构建密钥不得入库、不上传、不过早泄露。
- 对于桌面加固、更新、签名相关变更，若未完成真实打包与验收，不可标记完成。

## 代码约定

- 主进程和共享代码使用 ESM，内部 import 使用 `.js` 后缀（与现有代码一致）。
- 渲染进程使用 Vue 3 `<script setup lang=\"ts\">`，共享类型优先从 `@desktop/types` 引入。
- Store/Mapper/Adapter/Service/Adapter 职责分明，避免单文件承担多领域职责。
- 主进程不得直接读写数据库；宿主负责安全边界、网络策略和文件 I/O。
- 删除与回滚需记录可恢复路径，不得只依赖单点状态。
- 不得移除测试，不得降低阈值来“通过”。
- 主进程 Electron 相关模块不能依赖 `node --test` 直接运行验证，必须结合 `npm run check` 的类型检查与真实 Electron 验收。

## UI 设计与可访问性

- UI 任务先读 `local-docs/p0-product-completion-roadmap/00-foundation/ui-design-standards.md`。
- 组件样式优先复用既有 token 与已有组件；禁止私自引入第二套主题或硬编码品牌色。
- 统一使用既有图标系统（如 Lucide）与字体体系，避免重复格式转换或混用风格。
- 交互应同时支持键盘/触摸/点击；拖拽操作保留替代点击路径。
- 本地/云端标签、状态文案与可见提示必须一致；颜色不能是唯一状态来源。
- 需要支持深浅色、键盘焦点、tooltip 与适配文本缩放场景（至少到 200%），并对关键按钮保留安全确认/取消路径。
