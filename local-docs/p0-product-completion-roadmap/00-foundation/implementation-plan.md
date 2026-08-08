# P0 产品能力补齐总实施计划

> 状态：执行中；P0/P0-A/P1 已完成，下一阶段为 P2  
> 日期：2026-07-24

## 1. 实施顺序

```text
P0 契约与回归基线
  └─ P0-A 云端单文档简历重构
       ├─ P1 附件接入
       └─ P2 JD 粘贴入库
            └─ P3 结构化匹配分析
                 └─ P4 简历仓库
                      └─ P5 集成交付
```

P0-A 已把三端简历契约改为云端单文档并完成跨端预验收；P1 已完成 Electron 本地附件接入和
真实 DOCX 经历导入验收。下一步实施 P2；P3 必须使用已经保存并带稳定 requirement IDs 的 JD。P4 基于 P0-A 的
`CloudResume.structured/contentHash` 实现仓库，不再引入另一套云端格式。P5 才宣称完整
P0 产品链路可用。

## 2. 分层实施

每个业务阶段按同一顺序推进：

1. 后端 schema、service 和 API 缺口；
2. App API types、Normalizer、Adapter；
3. 纯领域 Proposal、验证器、状态机；
4. 宿主 Approval 与 Executor；
5. Electron IPC/平台 Adapter；
6. Vue composable 与小组件；
7. Agent tool、prompt 和持久化策略；
8. 自动化、真实模型、真实账号和视觉验收；
9. 更新阶段实施结果和总路线状态。

任何阶段不得从 Vue 组件直接调用后端，也不得让模型直接提交任意 HTTP payload。

## 3. 公共测试矩阵

| 层级 | 必测内容 |
| --- | --- |
| 纯函数 | schema、Normalizer、hash、去重、云端当前文档投影、同步状态、评分和过期判断 |
| Agent | 正确选工具、分页、完整上下文、不得越权写入、不得编造已保存 |
| Executor | accept/reject/custom、幂等、部分失败、取消、同步/并发冲突 |
| API | 鉴权、所有权、非法 MIME、大小、并发、删除影响和响应契约 |
| Renderer | 浅/深主题、键盘、缩放、空/载入/错误/过期状态 |
| 跨端 | App 写入 Web 可读；Web 修改后 App 刷新可见 |
| 回归 | G1–G7 全量测试、真实 Chromium、字体、A4 和 PDF 不退化 |

## 4. 阶段门禁

每个阶段完成必须同时满足：

- 阶段 README 中的功能和失败场景全部验收；
- App `npm run check` 通过；涉及 A4 时 `npm run qa:resume-renderer` 通过；
- 后端 focused tests、ruff、mypy 通过；共享契约变更时后端全量测试通过；
- Web 端相关 typecheck/契约测试通过；
- `git diff --check` 通过；
- 新业务文件没有超过 250 行，没有组件同时承担 API、状态机和展示；
- 至少一次真实 Electron 用户路径验证；有 LLM 语义判断时进行真实 DeepSeek 多样本评测；
- 阶段实施结果记录真实数据、失败和遗留项，不只写“已完成”。

## 5. 交付节奏

### P0：契约和基线

冻结共享类型、当前能力矩阵和测试 fixtures；随后由 P0-A 完成云端单文档破坏性重构、空库
重建、数据重导和 App/Web 双向预验收。该阶段已完成。

### P1：桌面简历附件

复用已有 App Core/CLI 解析和导入审批，只补 Electron 系统选择、受控文件注册、Composer 状态和
真实桌面交互；不重建 Web/后端上传链路。该阶段已完成并通过自动化、真实 Electron 和
App 写入/Web 共用 API 读回验收。

### P2：JD

先实现原文与 requirements 的 Proposal，再接后端 create，最后加入 Artifact 卡和上下文绑定。
P0 不实现 JD 去重；`duplicateStatus` 恒为 `none` 且 UI 不展示重复提示。

### P3：匹配

先固化评分 rubric 和证据 schema，再实现本地 Agent 生成与宿主验证，最后实现报告 UI 和语义评测。

### P4：简历仓库

先实现云端当前内容 read model，再合并本地草稿与同步状态，最后实现单项操作和冲突处理。破坏性操作最后接入；不实现云端版本或 diff。

### P5：集成

用真实账号走通“导入 → JD → 匹配 → 简历 → 仓库”，并在 P0-A 已通过的 API 级 App/Web
互读和并发冲突基线上，补齐完整 UI 主路径及所有 G1–G7 回归。

## 6. 后续路线接口

本路线为后续模块预留但不实现：

- BrowserAdapter 向 P2 提供受控 JD 页面原文；
- MailAdapter 从 P4 读取已发布简历 PDF；
- 通用材料路线在需要保留原始文件、图片或经历附件关联时复用后端文件存储；
- Application Tracker 通过 `resumeId` 记录实际投递，仓库只读取投递使用摘要，不从简历
  状态或历史推断投递事实；
- 面试准备读取已确认 JD、匹配报告和投递记录，不复制数据。
