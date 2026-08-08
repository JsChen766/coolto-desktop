# G4：优秀简历质量与局部修复

> 状态：已完成  
> 完成日期：2026-07-23  
> 前置依赖：G3

计划产物：事实价值和 JD 覆盖排序、重复内容检查、页面过空/溢出/尾行短的定向诊断，
以及最多三轮的有界局部 alternatives。常规路径不生成大量候选，也不整份重写。

实施计划：[G4 优秀简历质量与有界局部修复实施计划](./g4-implementation-plan.md)。

## 完成结果

- 已实现确定性质量 review、近重复/来源/责任级别/must-have 检查；
- 已实现最多三轮、冻结合格区域、beam width 4 的局部 alternatives；
- 已实现排序未消费 evidence 和 LLM context 压缩；
- 已实现 `ready_for_approval` 与 `needs_user_decision`，但没有 G5 保存写入；
- 72 项全仓测试和真实 Chromium/PDF G4 集成通过；
- 实测一次局部 alternative 将近重复候选从 `needs_revision` 修复为
  `ready_for_approval`，最终页面占比 87.29%、最低尾行 67.65%。
- 使用真实 `deepseek-v4-flash` 完成中文、英文、must-have 无来源三类受控语义样本，
  3/3 通过；中文和英文进入 `ready_for_approval`，无来源样本正确进入
  `needs_user_decision`，没有编造 Kubernetes；
- 将精确 `availableEvidence` 前移到 source snapshot 后，三个样本均以一次 prepare、
  一次 review 完成，工具失败为 0；模型调用共 12 次，耗时 47.26 秒，Provider 报告
  总 token 81,185。

语义评测使用隐私安全的固定样本和真实 DeepSeek/Agent/业务工具，但为隔离语义变量采用
确定性布局 compiler；A4、字体、85%、66.71% 和 PDF 则由独立的真实 Chromium 集成覆盖。
结构化结果见 [DeepSeek 语义评测结果](./g4-deepseek-semantic-eval-result.json)。下一阶段进入
[G5：保存和跨端互通](../06-g5-save-and-cross-client/README.md)。
