# G3 本地增量生成闭环实施计划

> 状态：已完成  
> 日期：2026-07-23  
> 前置门禁：[G1/G2 质量加固](../00-foundation/g1-g2-quality-hardening-plan.md)已通过

## 1. 阶段目标

让本地 Pi Agent 在同一个 turn 中通过有界工具循环完成：

```text
锁定 source snapshot
→ prepare_resume_candidate 创建固定骨架并真实测量
→ Agent 根据完整前文、证据和页面预算生成下一批 bullet
→ patch_resume_candidate 原子写入
→ EvidenceLedger 校验
→ Chromium 编译
→ 返回稳定 ID 诊断和剩余预算
→ 继续局部 patch，直到 layout_qualified 或需要用户补充来源
```

G3 只完成“来源约束 + 增量写作 + 真实布局反馈”内核。优秀简历的语义评分、最多三轮
alternatives 和系统化质量评测属于 G4；保存和审批属于 G5。

## 2. 模块边界

```text
src/resume/workspace/
├── types.ts                 # Workspace 与 patch 领域类型
├── compiler-port.ts         # 不依赖 Electron 的编译接口
├── candidate-skeleton.ts    # 固定栏目、header、教育和经历元数据注入
├── candidate-patch.ts       # 稳定 ID 原子 patch
├── candidate-budget.ts      # px/视觉行/JD 覆盖诊断
├── candidate-ranking.ts     # 最佳快照字典序比较
├── workspace-store.ts       # 当前任务内存态与 revision CAS
├── candidate-preparer.ts    # prepare 用例编排
├── candidate-patcher.ts     # patch 用例编排
└── workspace-projection.ts  # 模型需要的完整前文与精简诊断

src/tools/resume-candidate/
├── schemas.ts
├── prepare-candidate.ts
├── patch-candidate.ts
└── index.ts
```

领域层只依赖 `ResumeCompiler` port。Electron adapter 继续由 G2 的
`ElectronResumeCompilerService` 实现。任何文件原则上控制在约 250 行以内；prepare、patch、
预算、排名和投影不合并为一个 Workspace 上帝类。

## 3. 固定骨架

- language 首版限定 `zh-CN` / `en-US`；
- 姓名、联系方式、经历标题、组织、角色、地点和日期由 snapshot 确定性注入；
- 教育经历必须有真实 education source，没有时 prepare 失败并要求用户补充；
- 工作、项目、专业技能标题固定，实习与工作统一进入工作经历；
- 项目 section 没有真实 project source 时隐藏；
- 专业技能首版由选中经历的真实 tags 去重生成，模型不能自由添加无来源技能；
- snapshot 内排序仅用于 fingerprint；展示顺序使用 prepare 输入中的明确 experience order。

## 4. Prepare 契约

`prepare_resume_candidate` 接受：

- 目标 JD ID；
- 有序 experience IDs；
- language；
- 可选第一批 evidence-bound bullets。

宿主执行：

1. 重新构建 source snapshot；
2. 创建固定骨架；
3. 为初始 bullet 建立 EvidenceLedger；
4. 真实 Chromium 编译；
5. 创建内存 Workspace 和 best snapshot；
6. 返回 candidate ID、revision、完整结构化前文、evidence、JD 覆盖、硬门结果和页面预算。

## 5. Patch 契约

`patch_resume_candidate` 只支持稳定 ID 操作：

- `add_bullet`；
- `replace_bullet`；
- `remove_bullet`；
- `move_bullet`（同一 item 内排序）。

每次请求必须携带 `candidateId`、`expectedRevision` 和一组有序操作。宿主在 clone 上执行，
重建 EvidenceLedger 并编译；任何操作、证据或编译异常都不修改原 Workspace。成功后 revision
递增，并按字典序保留历史最佳快照。

不允许模型覆盖整份 JSON、HTML、CSS、模板或固定元数据；bullet 不得跨 source experience
移动。

## 6. 页面预算与上下文

每次工具结果返回：

- 完整当前 `ResumeStructure` 和可见文本；
- 全部已接受 bullet 和 evidence bindings；
- covered/uncovered JD requirement IDs；
- `usedHeightPx`、`availableHeightPx`、`usageRatio`；
- `pxToMinimum`、`pxToTarget`、`pxBeforeOverflow`；
- Chromium 实测 body line height 和估算剩余视觉行；
- 精确到 bullet ID 的尾行失败和其他 violations；
- 当前 revision、状态和下一步说明。

状态仅包括 `writing`、`needs_revision`、`layout_qualified`。G3 的
`layout_qualified` 不等同于 G5 的 `ready_for_approval`。

## 7. 安全与生命周期

- Workspace、source snapshot、evidence 和候选工具结果均为当前运行任务瞬态数据；
- 保存对话前 redaction `get_resume_source_snapshot`、`prepare_resume_candidate` 和
  `patch_resume_candidate`；
- 恢复历史对话后必须重建 snapshot 和 candidate；
- 本阶段没有 Resume/ResumeVariant 写 API，也不调用后端 Agent；
- 每个 Workspace 设置 patch revision 上限，防止无界循环。

## 8. 测试与完成定义

- 固定骨架栏目、教育要求、工作/项目映射和 skills tags；
- prepare 初始测量和完整 projection；
- add/replace/remove/move patch；
- stale expectedRevision、错 item、跨经历、重复 ID、错误 quote/offset 全部失败且不改状态；
- 页面预算和 JD 覆盖计算；
- best snapshot 不被变差版本覆盖；
- 候选工具结果持久化前被 redaction；
- Agent 工具注册和 system prompt 回归；
- `npm run check` 与真实 Chromium QA 通过；
- 至少一个确定性 Agent tool-loop 测试证明模型可以 prepare 后根据诊断继续 patch。

完成后更新本目录 README，并进入 G4；不在本阶段实现保存或宣称“优秀简历质量已完成”。

## 9. 实施结果

完成日期：2026-07-23。

- 已实现 `prepare_resume_candidate` 和 `patch_resume_candidate`，并接入桌面端每个对话独立的
  内存 Workspace；没有调用后端 Agent，也没有新增数据库写入；
- 固定骨架从 source snapshot 注入联系人、教育、工作、项目和真实 tags；教育来源缺失时失败
  关闭，工作与实习统一映射到工作经历；
- 每次 patch 使用 `expectedRevision` CAS，在 clone 上执行 add/replace/remove/move，重新构建
  EvidenceLedger 后再编译；失败 patch 不改变 Workspace；
- 每次工具结果返回完整结构、完整可见前文、全部 evidence bindings、JD 覆盖、px/视觉行预算、
  bullet 尾行诊断和最佳快照；
- 只有真实 Chromium 门禁通过，且每个工作/项目经历至少已有一个事实绑定 bullet，状态才会
  进入 `layout_qualified`；
- source snapshot、candidate 和 evidence 工具结果在对话持久化前被替换为重建标记；恢复任务
  后不能复用旧 candidate ID；
- Workspace 领域文件最大 212 行，prepare、patch、骨架、预算、排名、状态、投影和存储保持
  独立，没有建立 Workspace 上帝类；
- 确定性 Agent 测试已证明同一 turn 内可执行 `prepare → 根据反馈 patch → 达标停止`；
- `npm run check` 全部通过，共 63 项测试；
- G3 真实 Chromium 集成 QA 通过：18 个 evidence-bound bullets，经一次原子 patch 达到
  87.29% 页面占比，最低尾行比例 67.65%，所有 bullet、字体和 A4/PDF 门禁通过。

G3 的“来源约束 + 增量写作 + 真实布局反馈”已经完成。语义质量评分、重复度、事实价值、
定向 alternatives 和最多三轮修复属于 G4，开始实现前须另行冻结 G4 实施计划。
