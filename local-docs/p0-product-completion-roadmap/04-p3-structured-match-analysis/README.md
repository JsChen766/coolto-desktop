# P3：结构化岗位匹配分析

> 状态：✅ 完成（2026-07-24）  
> 实施计划详见：[04-p3-match-analysis/README.md](../04-p3-match-analysis/README.md)  
> 前置：P2 通过；目标 JD 已有稳定 ID 和 requirements

## 实施摘要

- `src/match/scorer.ts`：固定权重纯函数计算器（skills×40% + experience×35% + education×15% + overallImpression×10%）
- `src/match/report-builder.ts`：组装 MatchReport，id 前缀 `match-report-`
- `src/match/report-store.ts`：MatchReportStore，携带 jdTitle/jdCompany 元信息
- `src/tools/prepare-match-analysis.ts`：Agent 工具，TypeBox 校验 + jdReader 读取 + store 写入
- `src/desktop/main/match-emitter.ts`：IPC 事件 `match.report.created` 发送
- `src/desktop/renderer/.../MatchReportCard.vue`：聊天流卡片
- `src/desktop/renderer/.../MatchReportPanel.vue`：侧边栏完整报告面板
- 测试：22 个新用例全绿；Browser Demo 视觉验收通过

**待完成：** 真实 Electron + DeepSeek 端到端验收（非 demo mock）

## 输出契约

匹配报告必须同时包含：

1. 整体匹配度和等级；
2. 技能、经验、教育、综合印象四维分数；
3. 3–5 条亮点匹配，每条关联 JD requirement 与经历证据；
4. 能力缺口及“必须/加分”重要程度；
5. 对每个缺口的诚实建议；
6. JD 覆盖率、证据完整性、来源版本和过期状态。

## 固定评分

```text
整体匹配度 = 技能匹配 × 40%
           + 经验匹配 × 35%
           + 教育背景 × 15%
           + 综合印象 × 10%
```

最终加权由宿主纯函数计算，模型不能直接指定或覆盖总分。每个维度为 0–100，并返回评分理由、
证据和置信度。原文明确要求但没有证据支持的项按缺口处理；证据不足不得用默认乐观分填充。

等级沿用 PRD：85+ 强烈推荐、70–84 推荐、50–69 可选、30–49 不太匹配、低于 30 不推荐。

“综合印象”只使用稳定性、成长、协作等可由经历时间线和原文支持的信息，不推断年龄、性别、
健康、家庭、民族等敏感属性。

## 生成链路

```text
read current JD
→ 分页读取全部相关经历摘要
→ 读取候选经历 current revision
→ 构建带 hash 的 MatchSourceSnapshot
→ 模型一次生成结构化维度判断和证据引用
→ 宿主复验引用、重复、数字和 requirement 覆盖
→ 纯函数计算总分与等级
→ 仅修复未通过的局部字段
→ 生成 MatchReport
```

不得先生成大量完整报告再筛选。失败修复只针对无效引用、遗漏 requirement、重复亮点或不受支持
的结论，最多三轮；仍不能通过时显示证据不足并请求用户补充，不得降低真实性门槛。

## 与简历生成的关系

- MatchReport 不替代 G1 的 ResumeSourceSnapshot；
- 用户确认生成简历时，把 JD ID、推荐经历 ID 和报告摘要交给 G1，G1 仍重新读取最新来源；
- 报告分数不直接成为简历质量分；
- 简历页面占比、尾行和字体仍由 G2–G7 决定。

## UI

- 聊天显示紧凑摘要卡；右侧显示完整报告；
- 四维分数必须同时显示权重和证据状态；
- 亮点/缺口可展开到来源，不默认铺满聊天；
- 旧来源报告显示过期提示；
- 提供“基于此报告生成简历”主要操作，不增加独立“继续优化”按钮。

## 质检

- 构建覆盖强匹配、部分匹配、低匹配、教育缺失和事实诱导的金标样本；
- 单测固定权重、等级边界、分页、来源过期和敏感属性禁用；
- 真实 DeepSeek 多样本评估：结构有效率、证据正确率、缺口召回、重复率、分数稳定性；
- 同一输入多次运行的总分波动必须在阶段计划设定的容差内；
- 人工抽查不得出现凭空经历、数字、技能或公司事实。

## 完成门槛

- PRD 三部分输出和固定评分全部可见且可解释；
- 每个正向结论均有稳定来源，缺口不被虚构内容填平；
- 报告能一键进入既有简历生成链路；
- 真实模型评测和 Electron 视觉验收通过；
- 不调用后端 LangGraph。
