# Coolto 简历生成交付路线

> 状态：实施中  
> 当前阶段：G7 首轮实现完成并通过质检  
> 最近完成：G6 本地审批、系统路径选择、Chromium PDF 与视觉验收  
> 更新日期：2026-07-24

> G3 前置门禁：[G1/G2 质量加固](./00-foundation/g1-g2-quality-hardening-plan.md) 已通过。

本目录是简历生成链路所有阶段的唯一文档入口。总设计和跨阶段契约在
`00-foundation`，阶段计划、实现记录和验收结果归入对应 G0–G7 子目录。

## 文件树

```text
resume-generation-roadmap/
├── README.md
├── 00-foundation/
│   ├── README.md
│   ├── coolto-prd.docx
│   ├── coolto-architecture-plan.md
│   ├── coolto-agent-core-design.md
│   ├── coolto-resume-generation-design.md
│   └── coolto-resume-generation-implementation-plan.md
├── 01-g0-contract-and-regression/
│   └── README.md
├── 02-g1-source-and-evidence/
│   ├── README.md
│   └── g1-implementation-plan.md
├── 03-g2-chromium-compiler/
│   ├── README.md
│   └── coolto-resume-renderer-phase1-plan.md
├── 04-g3-local-generation-loop/
│   ├── README.md
│   └── g3-implementation-plan.md
├── 05-g4-quality-and-repair/
│   ├── README.md
│   ├── g4-implementation-plan.md
│   └── g4-deepseek-semantic-eval-result.json
├── 06-g5-save-and-cross-client/
│   ├── README.md
│   ├── g5-implementation-plan.md
│   └── g5-implementation-result.md
├── 07-g6-pdf-export/
│   ├── README.md
│   ├── g6-implementation-plan.md
│   └── g6-implementation-result.md
└── 08-g7-app-ui/
    ├── README.md
    ├── g7-implementation-plan.md
    └── g7-product-plan.md
```

## 阶段索引

| 顺序 | 阶段 | 状态 | 核心产物 |
| --- | --- | --- | --- |
| 00 | [基础与总设计](./00-foundation/README.md) | 持续维护 | PRD、架构边界、Agent Core、总链路 |
| 01 | [G0：契约和回归基准](./01-g0-contract-and-regression/README.md) | 已完成 | 数据契约、模板、字体、fixtures |
| 02 | [G1：来源快照和证据门禁](./02-g1-source-and-evidence/README.md) | 已完成 | current revision snapshot、原文 quote/offset、evidence ledger |
| 03 | [G2：Chromium 编译器](./03-g2-chromium-compiler/README.md) | 已完成 | DOM 测量、质量门、隐藏 renderer |
| 04 | [G3：本地生成闭环](./04-g3-local-generation-loop/README.md) | 已完成 | prepare/patch、完整上下文、页面预算 |
| 05 | [G4：质量与局部修复](./05-g4-quality-and-repair/README.md) | 已完成 | 事实/JD 质量、最多三轮局部修复、真实模型评测 |
| 06 | [G5：保存和跨端互通](./06-g5-save-and-cross-client/README.md) | 已完成 | 内部 staged publication、审批、Web/App 当前内容互读 |
| 07 | [G6：PDF 导出](./07-g6-pdf-export/README.md) | 已完成 | printToPDF、postflight、保存流程 |
| 08 | [G7：App 前端](./08-g7-app-ui/README.md) | 首轮实现完成 | 可编辑 Canvas、本地自动保存/回退、AI 变更确认、云端保存、导出 |

## 文档维护规则

- 跨阶段决策只写入 `00-foundation` 的总计划；
- 阶段级计划、执行记录、测试结果写入对应阶段目录；
- 一个阶段开始时更新本页的“当前阶段”和状态表；
- 一个阶段完成时必须在其 README 记录完成定义、测试结果和下一阶段入口；
- 真实账号、密码、session token 和用户简历内容不得写入文档；
- 路径引用使用相对链接，移动文档后必须运行引用检查。
