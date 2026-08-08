# G0：契约和回归基准

> 状态：已完成  
> 完成日期：2026-07-23

## 目标

锁定 App 与后端/Web 共享的固定资产和存储契约，为后续生成链路提供不可由模型修改的
基础边界。

## 已完成

- 同步 `ResumeStructure` 兼容类型；
- 锁定 `resume-standard` / `resume-sparse` manifest；
- 同步 SimSun 和 Times New Roman 字体及 checksum；
- 保存 Web canonical renderer 源码快照；
- 建立中文、英文、混排、欠填、尾行失败和溢出 fixtures；
- 建立模板同步与漂移检查。

## 关联文档

- [总实施计划](../00-foundation/coolto-resume-generation-implementation-plan.md)
- [简历生成设计](../00-foundation/coolto-resume-generation-design.md)
- [G2 渲染编译器结果](../03-g2-chromium-compiler/coolto-resume-renderer-phase1-plan.md)
