# AGENTS.md

本文件是本仓库的 Agent 协作约定。开始任何工作前先读一遍，并同步阅读
`local-docs/p0-product-completion-roadmap/README.md` 中当前阶段的实施内容、确认点与完成门槛。

## 工作原则

1. **不确定必追问**：任何不确定的点、任何值得讨论的设计/取舍，都必须先向用户确认，得到答复后再动手。不要擅自替用户做假设。
2. **每阶段完成写回 roadmap**：无论做了什么，每完成一个阶段（或阶段内的一个 section），都要把完成情况写回 `local-docs/` 下对应 roadmap 文件夹里的文档。
   - 做的是哪个 section，就写在那个 section 对应文件夹的 README 里。
   - **不要新建 section**：只在已有 section 对应的文档里追加/更新完成记录，保持 roadmap 结构不变。
   - 只记录真实完成、验证证据、失败和遗留项；不得因接口存在、Browser Demo 可见或局部测试通过而提前标记完成。
3. **文件行数**：所有业务代码和样式文件目标 220 行，硬上限 250 行；超限前按职责拆分，禁止上帝类、万能 Store、万能 Manager 或按实体堆叠分支的巨型模块。
4. **提交约束**：除非用户明确要求，否则不 commit / push。
5. **UI 先方案后实现**：任何 UI 布局及其他面向用户展示的内容，必须先向用户给出方案并由用户确认后再开始实现；UI 样式必须符合当前主题，优先复用或沿用现有组件、设计 token 与样式。

## 当前 Roadmap

- 唯一正式执行入口：`local-docs/p0-product-completion-roadmap/README.md`；其他阶段文档保留历史背景、契约和完成记录，不得形成第二条并行开发顺序。
- 已完成阶段：N0、N1、S3、A0、J0、J1、J2、J3、E0、E1、E2、E3、E4、E5、E6；当前下一阶段为 S4。
- 后续固定顺序：`A0 → J0 → J1 → J2 → J3 → E0 → E1 → E2 → E3 → E4 → E5 → E6 → S4 → S5 → R1`。
- 不得跳过阶段；每阶段开始先复核现状和工作树，并在真正开始该阶段时逐项向用户确认 Roadmap 已保留的确认点。
- J0–J3 已完成求职仓库关系模型、UI 方案、只读展示和跨模块写入闭环；E0–E6 已完成经历仓库规则、Store/IPC、时间线与维护、同步恢复、导入定位、版本历史/恢复及统一验收。S4 的 Tracker 子实体布局仍必须到对应阶段先确认。
- 后续从 S4 开始继续按固定顺序推进；不得因 J3 已提供 Application 主记录写入而提前把 Interview、Note、Reminder 或通知混入求职仓库。

## 产品关系约束

- Experience 是独立、可复用的长期事实资产，不永久隶属于 JD、Resume 或 Application。
- Experience 默认只发现 `active`；`archived` 在恢复前不参与 Agent/JD/Resume 下游。
  用户已确认的本地 `pending` revision 可作为冻结证据；`conflict`、`failed` 和墓碑不可作为新证据。
- Experience 日期必须保留 `YYYY-MM`/`YYYY-MM-DD`/`present` 精度；未填写结束日期不等于
  `present`。只有正文 hash 变化创建 revision，纯元数据变化不得制造伪版本。
- JD 是岗位目标；一个 JD 可关联多份 Resume，也可在没有 Resume 时独立存在。
- Resume 最多有一个主要目标 JD，也可作为不绑定 JD 的通用 Resume；任何 Resume 均可通过不同 Application 实际投递多个 JD，该事实不反向改写主要目标绑定。
- Application 才是一次真实投递事实，必须同时保存实际 `jdId`、`resumeId` 及投递时的标题快照。
- 通用 Resume 可原样用于不同 JD 的 Application；关系录错走显式纠错，只有内容针对新 JD 改变时才另存为新 Resume。
- 新建 Application 必须冻结实际提交 Resume 的 `contentHash` 到 `resumeContentHashSnapshot`；普通更新保持该值，只有显式纠正 Resume 关联时才随标题快照一起刷新。历史空值必须明确显示未锁定版本。
- Interview、Note、Reminder 属于 Application；JD 和 Resume 只能展示由 Application 派生的投递摘要，禁止保存第二套投递状态。
- 业务写入统一经过不可变 Proposal、宿主审批、LocalSyncStore/Outbox 和乐观锁；页面默认读取本地 projection，不绕过同步链路建立 Direct 写入。

## 项目命令

- 全量校验（提交前必跑）：`npm run check`
  - 依次执行：`check:resume-template` → `check:source-lines`（`src/` 业务源文件 250 行硬门禁）→ `typecheck`（Node）→ `desktop:typecheck`（Vue/vue-tsc）→ `test` → `build` → `desktop:build`
- 仅行数门禁：`npm run check:source-lines`
- 仅类型检查：`npm run typecheck`（Node 主进程）、`npm run desktop:typecheck`（渲染进程 Vue）
- 单测：`npm run test`（`node --test`，测试不依赖 electron 运行时）
- 桌面开发：`npm run desktop:dev`

## 代码约定

- 主进程/共享代码用 ESM，import 路径带 `.js` 扩展名（与现有代码一致）。
- 渲染进程用 Vue 3 `<script setup lang="ts">`；共享类型从 `@desktop/types`（`src/desktop/shared/types.ts`）引入。
- 主进程 Electron 相关模块无法在 `node --test` 下运行，靠 `npm run check` 的类型检查 + 真实 Electron 手动验收覆盖（与现有 main 模块一致）。
