# Resume 生成优化路线：Agent 全编排（resume-gen-optimization）

> 状态：A（版面）、B（模型行为）与 D（CLI 基建）问题已处理；C 契约问题详见 [06-issues](./06-issues/README.md)
> 当前阶段：Issue 收敛——E1（性能对比）→ C2（重新登录后的真实 profile push 验证）→ A2（尾行修复边界观察）
> 最近完成：B1–B3（默认 bullet 长度与拒绝优先级、证据引用剥离后的重复校验、生成时序指令）及其回归测试；CLI Agent 个人资料更新审批入口（接受前不写入）；语义编译器校准、CLI patch 工具链 + continuation 循环 + 预算保护 + 审批审计。
> 更新日期：2026-08-13

本目录是「路径 A 宿主编排 → Agent 全编排」改造的唯一文档入口。背景链路详见
`../resume-generation-roadmap/README.md`（G0–G7 既有能力，本优化不改动其契约）。

## 目标

把现有生成链路的「宿主编排」改为「Agent 全编排」：

- **角色重定位**：宿主不再做任何决策（不规划、不扩选、不自动收尾），只提供
  原子工具、不可变校验、预算兜底。
- **Agent 拥有全部编排权**：选经历 → 定布局 → 逐条写 bullet（并行）→ 自主收尾。
- **合并为一条生成路径**：下线 `prepare_planned_resume` 与 `prepare_resume_candidate`，
  只保留 `patch_resume_candidate` 作为修改原子能力。

## 用户已确认的关键决策

1. **bullet 写作形态**：主 Agent 逐条工具调用——Agent 在 `write_bullet` 调用参数里
   直接给出 `bulletText`，宿主只做校验，不调匿名写手（删 `parallel-writer.ts`）。
2. **路径合并**：合并为一条路径，两条旧生成工具下线。
3. **宿主硬机制工具化**：测量（typography/预算）、扩选（search_experiences 已有）、
   收尾（patch 自主补长）、校验全部交由 Agent 决策；宿主保留像素测量、不可变校验
   与状态机。

## 生成循环（改造后，Agent 视角）

1. `get_resume_source_snapshot` — 锁定 JD + 经历快照（保留不变）
2. `inspect_resume_layout` — 读硬预算（行数/每行字符/像素上限）与每条经历的证据
   候选（含 JD 命中）（保留，内部含 typography 校准）
3. Agent 决策布局：每条经历几条 bullet、每条用哪些 evidenceId、目标行数
4. 并行发起多个 `write_bullet` 调用（一次 assistant message 内，pi-agent-core 默认
   `toolExecution: "parallel"`；每条自带 bulletText + evidenceIds + 字符目标）→
   宿主逐条校验（长度 / 数字可验证 / 证据唯一 / 无重复片段 / 字符预算），接受落盘、
   拒绝给精确原因
5. `inspect_resume_draft` — 只读真实 Chromium 编译 + 完整诊断（usageRatio、
   violations、尾行、剩余证据），Agent 决定下一步
6. 材料不足 → Agent 自行 `search_experiences` / `get_experience` 扩选 → 重新
   `get_resume_source_snapshot`（已有能力，提示词明确流程）
7. 收尾 → Agent 用 `patch_resume_candidate`（append_text / add_bullet）自主补长
   （宿主不再自动 fill-to-gate）
8. `layout_qualified` → 自动确定性 quality review → `ready_for_approval`（保留）

## 工具契约（新增 2 个）

### `write_bullet`（新，`executionMode: "parallel"`）

- 参数：`itemId`、`experienceId`、`evidenceIds[1-3]`、`bulletText`、
  `targetChars{min,max}`
- 宿主校验：证据属于该经历且未消费、文本长度在目标 ±15%、数字逐字存在于证据原文、
  无重复片段、字符预算乐观账本
- 校验通过即落盘到 workspace（draft 累积机制，revision+1）
- 关键设计：**预算级校验不阻塞并行**——单条只做内容级校验，超预算推迟到 compile
  统一报 violation（否则并行调用互相竞争误拒）

### `inspect_resume_draft`（新）

- 参数：无（当前 workspace）
- 返回：真实编译结果 + 诊断投影（visibleText、availableEvidence、quality、预算状态）
- 复用现有 `projectResumeWorkspace` + compiler，纯只读

## 退役清单

| 文件/模块 | 处置 |
| --- | --- |
| `tools/planned-resume/prepare-planned.ts` | 工具下线（registry 移除） |
| `resume/planning/planned-resume-writer.ts` | 删除（宿主编排入口） |
| `resume/planning/planner.ts` | 只保留常量与校验函数（MIN_TAIL_RATIO、EXPANSION_FACTOR 等），决策函数 `planResumeWriting` 删除 |
| `resume/planning/parallel-writer.ts` | 删除（匿名写手不再需要） |
| `resume/planning/auto-expand.ts` | 删除（扩选权交 Agent） |
| `resume/planning/fill-to-gate.ts` | 删除（确定性收尾停用） |
| `tools/resume-candidate/prepare-candidate.ts` | 路径 B 下线（registry 移除） |
| `resume/planning/typography-calibration.ts` | 保留（inspect_resume_layout 内部调用） |
| `resume/planning/ai-layout.ts`、`layout-context.ts` | 校验/上下文逻辑保留，挪入 write_bullet 与 inspect 校验路径 |
| `patch_resume_candidate`、quality、candidate-patch、EvidenceLedger、compiler | 保留（修改与收尾的原子能力） |
| `system-prompt.ts` 生成章节（24-38 行区域） | 重写为 Agent 编排指令 |
| `resume-continuation.ts` | 保留预算兜底（230s/30 调用），**停用宿主 trySectionFill**，改为纯诊断注入 |

## CLI 基础设施（自测配套）

CLI（`src/cli/main.ts`，`npm run dev`）目前未注册生成工具链，改造后必须补齐：

1. **生成工具链注册**：CLI 的 `createToolRegistry` 传入 write_bullet / inspect_resume_draft
   / patch 等全部生成工具依赖。
2. **编译实现**：CLI 无 Electron 环境，编译用语义模拟（复用/迁移
   `scripts/support/semantic-eval-compiler.ts`），供编排行为自测；真实像素编译在
   Electron 手动验收覆盖。
3. **PDF 导出**：新增 Electron headless 入口脚本，接收已合格 structure JSON →
   BrowserWindow + `printToPDF` → 写盘到 `local-output/`。
4. **输出目录约定**：CLI 导出的 PDF/JSON 一律写入 `local-output/`（已被 .gitignore
   忽略），禁止写进仓库其他目录。

## 实施阶段

| 顺序 | 阶段 | 状态 | 核心产物 |
| --- | --- | --- | --- |
| S0 | [CLI 基础设施](./01-s0-cli-infra/README.md) | 已完成（随 S1 接线：语义编译 + 生成工具链注册；PDF 导出入口待 S2 补充） | 生成工具链注册、语义编译、Electron PDF 导出、local-output |
| S1 | [工具层](./02-s1-tool-layer/README.md) | 已完成 | write_bullet + draft 累积 + inspect_resume_draft + 单测 |
| S2 | [Agent 编排](./03-s2-agent-orchestration/README.md) | 已完成 | 系统提示重写、continueUntilTerminal 诊断注入 |
| S3 | [路径合并](./04-s3-path-merge/README.md) | 已完成 | 下线两个 prepare 工具、退役宿主编排模块、依赖方清理 |
| S4 | [测试与验收](./05-s4-acceptance/README.md) | 核心验收已过（性能对比待真实模型） | 测试改写、agent eval、npm run check、性能对比 |
| 06 | [问题跟踪](./06-issues/README.md) | 持续维护 | A1-A2 版面偏差、B1-B3 模型行为、C1-C3 契约、D1-D3 CLI、E1 性能 |

## 验收标准

- `npm run check` 全量通过（check:resume-template → check:source-lines → typecheck →
  desktop:typecheck → test → build → desktop:build）
- Agent 编排在 CLI 语义编译下可完成：snapshot → inspect → write_bullet（并行）→
  patch 收尾 → layout_qualified → ready_for_approval 全流程
- 新文件 ≤250 行（write_bullet 校验超限拆 `bullet-validator.ts`）；ESM `.js` 后缀；
  UI 无改动（若涉及 UI 先给方案）
- Electron 手动验收：真实 Chromium 编译下生成一份合格简历并导出 PDF 到 `local-output/`

## 文档维护规则

- 阶段级计划、执行记录、测试结果写入对应阶段目录；
- 一个阶段开始时更新本页「当前阶段」和状态表；
- 一个阶段完成时必须记录完成定义、验证证据和遗留项；
- 真实账号、密码、session token 和用户简历内容不得写入文档。
