# G6：PDF 导出

> 状态：已完成

同一 Chromium renderer 的 `printToPDF`、A4/页数/文本/字体 postflight 和 PNG 视觉检查
在 G2 建立基础；G6 已补齐系统保存位置选择、导出失败恢复、审批和 Agent 导出入口。

- [G2 PDF 基础结果](../03-g2-chromium-compiler/coolto-resume-renderer-phase1-plan.md)
- [G6 PDF 导出实施计划](./g6-implementation-plan.md)
- [G6 实施与验收记录](./g6-implementation-result.md)

G6 已接通 `prepare_resume_pdf_export → Action Approval → 系统保存对话框 → Chromium
printToPDF → postflight → 原子写盘`。支持 `ready_for_approval` 候选和正式 active published
variant；用户接受审批前没有对话框、打印或文件写入副作用。
