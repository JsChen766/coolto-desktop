# S2 Agent 编排（系统提示 + 宿主循环改造）

> 状态：已完成
> 完成日期：2026-08-12

## 目标

把生成流程从"宿主编排"切到"Agent 全编排"：Agent 决策结构/预算/证据分配，逐条并行写 bullet，自主收尾。

## 交付物

1. **系统提示重写**（`src/agent/system-prompt.ts` 生成章节）：
   - 新流程指令：snapshot → inspect_resume_layout → 自行决策布局 → prepare_resume_draft →
     一次消息内并行 write_bullet → inspect_resume_draft 看真实编译诊断 → 未满继续写/patch 收尾
     → 材料不足 search_experiences 扩选重新快照 → layout_qualified 自动 quality review
   - 保留既有硬规则：evidenceId 逐字引用、数字逐字可验证、不做空转、被拒条目按原因修正重发
2. **`continueUntilTerminal` 改纯诊断注入**（`src/desktop/main/resume-continuation.ts`）：
   - 删除宿主 `trySectionFill` 确定性填充（host_fill 事件不再产生）
   - 循环只做预算兜底（230s/30 次模型调用）→ 每轮注入 `instructionFor` 诊断让 Agent 自主决策
   - 预算耗尽仍归一化 `needs_user_decision`（行为保留）

## 验证证据

- `test/system-prompt.test.ts` 更新为新编排工具断言（inspect_resume_layout / prepare_resume_draft /
  write_bullet / inspect_resume_draft / patch_resume_candidate），6/6 通过
- `test/resume-continuation.test.ts` 改写：验证"宿主零填充 + 诊断注入 + 预算耗尽归一化"，通过
- `test/resume-agent-loop.test.ts` 重写为 Agent 编排循环（faux provider）：并行 write_bullet →
  inspect → layout_qualified 全流程通过；"拒绝 → 修正重发"路径通过

## 遗留项

- `instructionFor` 诊断文案仍面向 patch 术语（writePlan.missing 等），后续可补充 write_bullet 视角提示
