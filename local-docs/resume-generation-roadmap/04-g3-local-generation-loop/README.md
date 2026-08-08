# G3：本地增量生成闭环

> 状态：已完成  
> 完成日期：2026-07-23  
> 前置依赖：G1、G2

已完成 `prepare_resume_candidate`、稳定 ID patch、完整前文上下文、证据账本投影、
页面预算反馈，以及 Pi Agent 在同一 turn 内的“写入 → 编译 → 诊断 → 局部修改”循环。

本阶段开始前必须先通过 [G1 完成定义](../02-g1-source-and-evidence/g1-implementation-plan.md)。

实施计划：[G3 本地增量生成闭环实施计划](./g3-implementation-plan.md)。

## 完成结果

- 每个 App 对话拥有独立的瞬态 Resume Workspace；
- 固定骨架、真实来源、稳定 ID 和 EvidenceLedger 构成生成边界；
- prepare/patch 每轮都调用同一个隐藏 Chromium 编译器并返回完整前文和 px 预算；
- stale revision、跨经历、重复 ID、伪造 quote/offset 和失败编译均不会部分提交；
- 只有每个工作/项目来源至少有一个 bullet 且全部布局硬门通过才停止；
- 全仓 63 项测试和 G3 Chromium 集成 QA 通过；实测页面占比 87.29%，最低尾行 67.65%。

下一阶段是 [G4：优秀简历质量与局部修复](../05-g4-quality-and-repair/README.md)。G4 开始前
先单独列出并持久化实施计划；G3 不包含保存或发布能力。
