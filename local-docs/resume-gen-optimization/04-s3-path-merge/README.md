# S3 路径合并（下线旧生成工具）

> 状态：已完成
> 完成日期：2026-08-12

## 目标

合并为一条生成路径：下线 `prepare_planned_resume` 与 `prepare_resume_candidate`（含
`review_resume_candidate`），退役宿主决策模块，清理全部依赖方。

## 退役清单

**已删除文件**

| 文件 | 说明 |
| --- | --- |
| `src/tools/planned-resume/prepare-planned.ts` | prepare_planned_resume 工具 |
| `src/tools/resume-candidate/prepare-candidate.ts` | prepare_resume_candidate 工具 |
| `src/tools/resume-candidate/review-candidate.ts` | review_resume_candidate 工具 |
| `src/resume/planning/planned-resume-writer.ts` | 宿主编排入口 |
| `src/resume/planning/parallel-writer.ts` | 匿名并行写手 |
| `src/resume/planning/auto-expand.ts` | 宿主自动扩选 |
| `src/resume/planning/fill-to-gate.ts` | 宿主确定性收尾 |
| `src/resume/planning/create-planned-writer.ts` | planned writer 工厂 |
| `src/resume/planning/write-workspace.ts` | 计划落盘 |
| `src/resume/planning/skill-bullets.ts` | 技能 bullet 宿主规划 |
| `src/resume/planning/ai-layout.ts` | 布局校验（能力并入 bullet-validator） |
| `src/resume/workspace/section-fill.ts` | trySectionFill（宿主填充，无使用方） |

**精简**

- `src/resume/planning/planner.ts`：只保留常量（MIN_TAIL_RATIO、MINIMUM_USAGE_RATIO、
  EXPANSION_FACTOR、TARGET_CHARS_PER_LINE_FACTOR）与类型 re-export；`planResumeWriting`
  等决策函数删除
- `src/resume/planning/bullet-plan.ts`：只保留类型；`bindingsFromPlan`/`summarizePlan` 删除
- `src/tools/resume-candidate/index.ts`：只导出 `createResumePatchTools`
  （patch_resume_candidate + alternativeTargets，保留为修改/修复原子能力）

**保留**

- `inspect_resume_layout`（测量工具）、`typography-calibration.ts`、`layout-context.ts`、
  `layout-inspector.ts`
- `patch_resume_candidate`（candidate-patcher + alternative-repairer + tail-fill 自动修复）
- `candidate-preparer.ts`：保留为内部 workspace 构建器（12 个测试 + QA/性能会话共用），
  不再暴露为 Agent 工具

## 依赖方更新

| 文件 | 改动 |
| --- | --- |
| `src/tools/registry.ts` | 移除 plannedResumeWriter / resumeCandidatePreparer 依赖与注册 |
| `src/desktop/main/agent-context-factory.ts` | 移除 planned writer / preparer 创建 |
| `src/desktop/main/resume-performance-session.ts` | 同上，性能会话改用 agentOrchestrated |
| `src/agent/context-policy.ts` | 压缩工具集 → prepare_resume_draft/write_bullet/inspect_resume_draft/patch |
| `src/agent/persistence-policy.ts` | 瞬态工具集与过期文案同步 |
| `src/resume/performance/generation-trace-store.ts` | 工具集合 + stage 映射（inspect→chromium_compile） |
| `src/resume/quality/alternative-repair-policy.ts` | 错误文案不再引用 review 工具 |
| `src/agent/system-prompt.ts` | 移除 review_resume_candidate 引用 |
| `src/desktop/main/agent-runtime-events.ts` | workspace 工具判定集合更新 |

## 测试改造

- `test/planned-resume.test.ts` 删除（被测模块退役）
- `test/resume-agent-loop.test.ts` 重写为 Agent 编排循环（见 S2）
- `test/agent-persistence-policy.test.ts`、`test/resume-quality.test.ts`、
  `test/resume-performance.test.ts`、`test/system-prompt.test.ts`：工具名断言同步
- `scripts/run-resume-agent-eval.ts`：registry 改 agentOrchestrated，断言
  usedPrepare/usedReview → usedDraft/usedWriteOrPatch，store 读取改 `latest()`

## 验证证据

- `npm run typecheck` 通过
- 全量 `npm run test`：仅剩 4 个 macOS 专属环境失败（atomic-pdf-writer /tmp 路径、
  update-installer /Applications 路径与 /bin/bash），与本阶段无关
