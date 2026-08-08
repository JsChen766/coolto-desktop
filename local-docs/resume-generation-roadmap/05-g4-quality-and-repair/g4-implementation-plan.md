# G4 优秀简历质量与有界局部修复实施计划

> 状态：已完成  
> 日期：2026-07-23  
> 前置门禁：G3 独立复检通过

## 1. 阶段目标

在 G3 的真实来源、稳定 ID 和 Chromium 编译闭环之上增加确定性内容质量门与有界修复：

```text
layout_qualified
→ review_resume_candidate
→ 确定性质量报告与最高优先级修复目标
→ 同一个 Pi Agent 为每个目标提供 2–3 个事实等价 alternatives
→ patch_resume_candidate 展开有限 beam
→ 每个候选重新执行 EvidenceLedger、质量检查和 Chromium 编译
→ 保留字典序最佳版本
→ 最多 3 轮
→ ready_for_approval 或 needs_user_decision
```

G4 不写数据库、不保存 ResumeVariant、不调用后端 Agent，也不使用另一个 LLM 作为评委。
`ready_for_approval` 只是 G5 保存审批的前置状态。

## 2. G3 复检结论

2026-07-23 在开始 G4 前重新执行：

- G3 核心、来源、Agent loop 和持久化隔离 18 项测试全部通过；
- `npm run qa:resume-renderer` 通过，Workspace 实测页面占比 87.29%，最低尾行比例
  67.65%，18 个 evidence-bound bullets 全部通过；
- A4 单页、SimSun、Times New Roman、PDF text layer 和 postflight 通过；
- 人工查看最新 PNG，无截断、重叠、乱码、Markdown 泄漏或额外页面；
- `npm run check` 共 63 项测试、类型检查和两端 build 全部通过；
- `git diff --check` 通过。

结论：G3 没有阻断 G4 的缺陷。该实测证明受控来源到真实 Chromium/PDF 的工程链路，
不宣称真实模型已经达到“优秀简历”语义质量；后者由本阶段建立质量门和评测。

## 3. 模块边界

```text
src/resume/quality/
├── types.ts                    # issue/report/score/repair target
├── text-similarity.ts          # 精确及近重复检测
├── requirement-coverage.ts     # 加权 JD 与 must-have 覆盖
├── claim-support.ts            # 责任级别和受保护事实检查
├── evidence-candidates.ts      # 未消费原文切片与事实价值排序
├── quality-evaluator.ts        # 组合确定性质量门
├── repair-planner.ts           # 失败优先级、冻结区域和目标
├── candidate-reviewer.ts       # 首次 review 用例
└── alternative-repairer.ts     # beam 展开、编译、排名、三轮上限

src/agent/
└── context-policy.ts           # 仅压缩发送给模型的旧瞬态结果

src/tools/resume-candidate/
├── review-candidate.ts
└── patch-candidate.ts          # 兼容直接 operations，并新增 alternativeTargets
```

质量、候选搜索、上下文压缩和工具 schema 不合并进 Workspace Store。新领域文件原则上不超过
约 250 行，避免产生质量评估或修复上帝类。

## 4. 确定性质量门

质量报告至少覆盖：

- EvidenceLedger 全量重放；
- 精确和近重复 bullet；
- JD 加权覆盖率、must-have 覆盖率；
- 未覆盖 must-have 是否在当前来源中存在可引用证据；
- 无来源的责任升级词和受保护事实；
- 工作/项目最低内容完整度；
- Chromium 页面、字体和尾行硬门。

软分仅用于同等硬门候选之间排序，包括 JD 覆盖、证据具体度、信息多样性和目标页面距离。
软分不能抵消来源、字体、一页、85% 或 66.71% 硬门失败。

## 5. 未使用证据与 token 优化

- 从当前 revision 正文按标点和换行切成保持 UTF-16 offset 的原文片段；
- 排除已经被 EvidenceLedger 消费或重叠的范围；
- 按 requirement keyword、权重、数字/技术具体度和信息增量排序；
- 每次 Workspace 投影只返回当前最相关的一小组 `availableEvidence`；
- Agent 的持久化 transcript 不变；只在发送给模型前把旧 snapshot 和旧 Workspace 大结果替换为
  小型 marker，保留最新完整 Workspace、完整可见前文、全部已接受 evidence 和候选原文；
- 测试记录压缩前后字符量，确保不会删除最新 revision、最新诊断或工具调用配对。

## 6. 有界 alternatives

`patch_resume_candidate` 保留 G3 的直接 operations，同时支持：

- 每轮最多 2 个最高优先级 target；
- 每个 target 最多 3 个 alternatives；
- 每个 alternative 是 1–3 个稳定 ID operations；
- beam width 固定为 4；
- 每个展开候选在 clone 上执行 evidence、质量和真实 Chromium 检查；
- 当前版本作为回退候选，修复变差时不覆盖最佳快照；
- 一次 alternatives 请求只提交一个新 revision，并计为一轮；
- 质量 review 开始后禁止用普通 direct patch 绕过三轮上限；
- 第 3 轮后仍有问题进入 `needs_user_decision`，不得静默降低门槛。

## 7. 状态与投影

G4 新增：

- `ready_for_approval`：来源、内容质量和全部布局硬门通过；
- `needs_user_decision`：来源不足、不可修复问题或三轮耗尽。

工具投影新增 quality report、repair targets、冻结 bullet IDs、repair round、候选编译数量、
耗时、修改前后差异和选择理由。G4 不实现 G5 的保存 Proposal。

## 8. 测试与完成定义

- 精确/近重复、责任升级、must-have 覆盖和无来源 must-have 单元测试；
- available evidence offset、重叠排除、排序和上下文压缩测试；
- review 状态迁移与结构 `quality_status/quality_issues` 测试；
- alternatives schema、beam width、原子提交、最佳快照回滚和最多三轮测试；
- tail、overflow、underfill、duplicate 和 missing requirement 修复优先级测试；
- 确定性 Agent 测试证明 review 后只修复目标区域，达标后停止；
- 真实 Chromium alternatives 集成至少验证一个局部候选从失败到通过；
- `npm run check`、`npm run qa:resume-renderer`、PNG 人工检查和 `git diff --check` 通过；
- 更新 G4 README、总路线和总实施计划。

只有全部门禁通过才把本计划状态改为“已完成”。

## 9. 实施结果

完成日期：2026-07-23。

- 新增 `review_resume_candidate`，只允许 G3 `layout_qualified` 候选进入质量 review；
- 确定性质量报告覆盖 EvidenceLedger 重放、精确/近重复、must-have 加权覆盖、来源是否支持
  未覆盖 requirement、责任级别升级、跨经历技术声明和全部 Chromium violations；
- Workspace 新增 `ready_for_approval`、`needs_user_decision`、quality report、repair round 和
  repair history；G4 不新增保存能力；
- `patch_resume_candidate` 保持 G3 operations 兼容，并新增最多 2 targets、每 target 最多
  3 alternatives、beam width 4 的宿主候选搜索；
- review 开始后普通 direct patch 被拒绝，已通过 bullet 默认冻结；第三轮后仍失败确定性进入
  `needs_user_decision`；
- 每个 alternative 在 clone 上执行 EvidenceLedger、质量评估和真实 Chromium 编译；编译器或
  未知异常不会被误吞，失败请求不会部分提交；
- Workspace 投影新增 ranked `availableEvidence`，保持 current revision hash、精确 UTF-16
  offset 和 quote，并排除已消费范围；
- Agent LLM context 只保留最新完整 Workspace；旧 snapshot/patch 大结果在发送给模型前压缩，
  持久化 transcript 和最新生成所需信息不变；新一轮 snapshot 不会被旧候选误压缩；
- G4 质量模块最大 232 行，QA runner 拆为 106 行编排和 194 行来源 fixture，没有新增上帝类；
- 全仓 `npm run check` 通过，共 72 项测试；`git diff --check` 通过；
- 确定性 Agent 回归已完成 `prepare → review → 单目标 alternative → ready_for_approval`；
- 真实 Chromium G4 集成已完成：从近重复 `needs_revision` 经 1 个局部 alternative 修复到
  `ready_for_approval`，只修改 1 个 bullet、编译 1 个候选，宿主记录约 16.81 ms；
- 修复后页面占比 87.29%、最低尾行比例 67.65%、18 个 bullets 全通过；A4 单页、PDF text
  layer、SimSun、Times New Roman 和 postflight 通过；最新 PNG 人工检查无视觉缺陷。

## 10. 真实 DeepSeek 多样本语义评测

2026-07-23 使用本地 `.env` 已配置的真实 DeepSeek API 和 `deepseek-v4-flash` 执行固定、
隐私安全的三样本评测。评测调用真实 Pi Agent、source snapshot、EvidenceLedger、prepare、
patch、review 和 G4 状态机；为隔离语义生成变量，布局使用确定性评测 compiler。真实 A4、字体、
85%、66.71% 和 PDF 门禁继续由第 9 节的独立 Chromium 集成负责，二者不能互相替代。

首次调用暴露出 `patch_resume_candidate` 顶层 `Type.Union` 会被 DeepSeek function calling
拒绝。已改为顶层 object，并在执行层强制 `operations` 与 `alternativeTargets` 二选一，新增
schema 回归测试。随后三样本 3/3 通过。

第一轮通过时仍出现 4 次手算 UTF-16 offset 失败。将排序后的精确 `availableEvidence` 放入
source snapshot，并要求模型逐字段复制 quote/offset 后，复测结果如下：

| 样本 | 预期/实际状态 | bullets | 模型调用 | prepare | tool failure | 耗时 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 中文事实完整 | `ready_for_approval` | 3 | 4 | 1 | 0 | 15.81s |
| 英文事实完整 | `ready_for_approval` | 6 | 4 | 1 | 0 | 15.60s |
| must-have 无来源 | `needs_user_decision` | 4 | 4 | 1 | 0 | 15.85s |

总计 input 31,826、output 4,047、Provider 报告 total token 81,185，端到端 47.26 秒。
相较 offset 优化前的已通过基线，模型调用从 19 降到 12，tool failure 从 4 降到 0，
Provider total token 从 164,328 降到 81,185，耗时从 127.99 秒降到 47.26 秒。

全部最终 bullets 均有 evidence binding，禁用夸张词为 0，修复轮数未越界；无 Kubernetes
来源的样本没有生成 Kubernetes、容器或集群经历，而是确定性停在 `needs_user_decision`。
结构化原始结果见 [g4-deepseek-semantic-eval-result.json](./g4-deepseek-semantic-eval-result.json)。

结论：G4 工程门禁和受控真实模型语义评测均已完成，可以进入 G5 保存与跨端互通。该结论不等于
模型对任意开放域真实经历都有 100% 稳定性；后续仍应把固定样本作为回归集持续运行。
