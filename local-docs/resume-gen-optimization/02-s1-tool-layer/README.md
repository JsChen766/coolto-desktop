# S1 工具层（Agent 编排原子工具）

> 状态：已完成
> 完成日期：2026-08-12

## 目标

Agent 全编排所需的三件新工具 + 校验器，宿主只提供原子能力与不可变校验。

## 交付物

| 文件 | 职责 |
| --- | --- |
| `src/tools/agent-orchestrated/prepare-draft.ts` | `prepare_resume_draft`：锁快照 → 建空骨架 → 首次真实编译 → 建 workspace（`draft-{fingerprint前12位}`）。同 sourceFingerprint 幂等返回 |
| `src/tools/agent-orchestrated/write-bullet.ts` | `write_bullet`：Agent 自带 bulletText，宿主校验后落盘。`executionMode: "parallel"`，提交全同步（无 await），并行调用在事件循环原子串行，无 revision 冲突 |
| `src/tools/agent-orchestrated/inspect-draft.ts` | `inspect_resume_draft`：只读真实编译 + 全量诊断投影（占用率/violations/尾行/剩余证据），`layout_qualified` 时自动触发确定性 quality review |
| `src/tools/agent-orchestrated/bullet-validator.ts` | 逐条内容级校验：证据归属与区间唯一（含跨 bullet 重叠）、长度 ±15% 容差、数字逐字可验证、自身与跨 bullet 重复片段检测 |
| `src/resume/workspace/section-lookup.ts` | 稳定 itemId 查找工具模块 |
| `test/agent-orchestrated-tools.test.ts` | 10 个单测，全部通过 |

## 关键设计（与计划一致）

1. **预算级校验不阻塞并行**：write_bullet 只做内容级校验；页面预算（行数/占用率）推迟到 `inspect_resume_draft` 的编译统一报 violation，避免并行调用互相竞争误拒。
2. **无需 candidateId/expectedRevision**：工具直接基于 `store.latest()`，同步提交天然串行，Agent 无需管理状态 ID。
3. **bulletId 自动生成**：`{itemId}-b{n}`；`matchedRequirementIds` 由程序按引用证据自动推导，Agent 不提供。
4. **skills synthetic item 放宽**：`item-skills-*` 允许跨经历引用证据（与 `assertItemSource` 既有语义一致）。

## 验证证据

- `node --import tsx --test test/agent-orchestrated-tools.test.ts`：10/10 通过
- `npm run typecheck`：通过（Node 主进程）
- `npm run desktop:typecheck`：通过（Vue 渲染进程）
- 全量 `npm run test`：425 pass / 4 fail，4 个失败均为 macOS 专属路径断言（`/tmp/`、`/Applications/`、`/bin/bash`）在 Windows 上的既有环境失败，与本阶段改动无关
- `npm run check:source-lines`：595 文件全部 ≤250 行

## 注册与接线

- `src/tools/registry.ts`：新增 `agentOrchestrated?: AgentOrchestratedDependencies`，注册三件新工具
- `src/cli/main.ts`：CLI 接入生成工具链（`CliSemanticCompiler` 语义编译，无 Electron 也可跑通状态机）
- `src/desktop/main/agent-context-factory.ts`：桌面端接入（真实 Chromium 编译 + quality reviewer）

## 遗留项

- `prepare_resume_draft` 与 `inspect_resume_layout` 存在快照/骨架重建重叠，S2 编排阶段评估是否合并
- CLI 的语义编译只由 bullet 数量驱动占用率，收尾调优行为需 Electron 手动验收
