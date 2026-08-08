# Coolto 本地优秀简历生成链路实施计划

> 后续产品语义（2026-07-24）：本计划中的 `ResumeVariant`、新 variant、
> `active_variant_id` 和版本链是 G5 原子发布、质量门和并发控制的内部实现。
> 用户产品只管理每份云端 Resume 的当前内容和本地检查点回退，不提供
> 云端版本历史、回退或 diff。

> 状态：G0–G7 首轮链路已完成  
> 版本：v1.1  
> 日期：2026-07-23  
> 适用范围：桌面 App 本地 Pi Agent  
> 关联文档：`coolto-architecture-plan.md`、`coolto-agent-core-design.md`、`coolto-resume-generation-design.md`、`coolto-prd.docx`
> 阶段索引：[简历生成交付路线](../README.md)

## 1. 文档目的

本文冻结 Coolto 桌面 App 的“优秀简历生成”链路。当前优先完成生成内核、事实约束、
真实排版和质量门禁；简历管理页面、预览交互和其他 App 界面在生成内核稳定后实施。

本计划只适用于本地 Pi Agent。桌面 App 不调用云端 LangGraph，不复制 Web Agent 的
生成算法。Web Agent 与 App Agent 只通过经历、JD、简历及版本等固定资产和普通业务
API 互通。

APP 最终保存的数据继续兼容后端现有 `Resume` / `ResumeVariant`、`structured`、版本链、
质量状态和发布状态。Web 和 App 可以独立生成，但必须能读取和渲染彼此保存的正式版本。

## 2. 最终目标

用户发起一次自然语言请求后，本地 Pi Agent 在同一个 turn 中像代码 Agent 一样循环工作：

```text
读取事实 → 规划 → 写入候选 → Chromium 编译/测量 → 阅读诊断
        → 局部 patch → 再编译/测量 → 全部通过 → 请求保存审批
```

对用户表现为一次“生成简历”；内部允许多次有界工具调用和局部修改。目标不是要求模型
第一次输出就精确命中像素，而是保证系统最终只接受通过全部硬门槛的候选，并避免整份
简历反复重写或预先生成大量文案候选。

正常路径目标：

- 一次主要内容生成过程；
- 生成过程中按经历或按小批量 bullet 增量写入；
- 最多 3 轮定向布局修复；
- 不进行整份简历重新生成；
- 不为每条 bullet 预先生成短、中、长多个版本；
- 只有真实失败点才生成少量局部 alternatives；
- 未通过全部门槛的版本不得保存为正式版本。

## 3. 不可违反的架构边界

1. 桌面 App 的 Agent 只使用本地 Pi Agent，不调用云端 LangGraph。
2. App 只通过普通业务 API 读取和写入固定资产，不直接连接 PostgreSQL。
3. G1–G6 的候选简历、布局诊断和生成过程只存在于本地任务内存；G7 接入 UI 后，允许将
   `structured`、证据引用、来源哈希和本地检查点加密自动保存到独立本地草稿库，但用户
   点击“保存到云端”并确认前不得写入云端简历版本。
4. 正式简历保存后以云端数据库为唯一权威来源，V1 不建立本地固定资产持久化缓存。
5. 模型不能直接写云端，真正保存由宿主内部 `ResumeSaveExecutor` 执行。
6. 模型不能修改 HTML、CSS、字体、模板 manifest、profile version 或 profile hash。
7. 生成、验证、预览和打印必须使用同一份结构化简历和同一份模板实现。
8. 招聘网站浏览器与简历渲染器必须隔离，不能共用页面上下文、Cookie partition 或权限。

## 4. 简历固定结构

### 4.1 固定栏目

首版简历使用以下固定栏目和固定标题：

```text
基本信息
教育经历
工作经历
项目经历
专业技能
```

规则：

- 实习经历和正式工作经历统一归入“工作经历”；
- section 标题由程序提供，模型不能改名或自由增加栏目；
- section 顺序由产品契约固定；
- 没有真实来源的项目经历时可以隐藏“项目经历”，不能编造项目填充；
- “基本信息”是固定 header，不作为模型自由写作 section；
- 第一版不生成独立“个人总结”栏目；
- 未来增加证书、获奖等栏目时必须升级结构契约，不允许模型临时创建。

### 4.2 程序注入的固定内容

以下内容从当前用户资料和固定资产确定性注入：

- 姓名、手机、邮箱、所在地和个人链接；
- 学校、专业、学历和教育起止时间；
- 公司或组织名称；
- 职位或角色；
- 工作、实习和项目起止时间；
- 地点；
- `source_experience_id`、revision ID 和 revision hash；
- section、item 和 bullet 的稳定 ID；
- 模板、字体和布局参数。

模型只负责：

- 从真实事实中选择适合目标 JD 的内容；
- 决定每段工作或项目经历的内容侧重点；
- 撰写和局部修改 bullet；
- 从有证据的技能中选择并组织“专业技能”；
- 在程序给定的页面预算内决定后续内容分配。

## 5. 硬性质量门槛

正式候选必须同时满足以下条件，任何软质量分都不能抵消硬门槛失败。

### 5.1 页面门槛

```text
page_count == 1
overflow_px <= allowed_tolerance
usage_ratio >= 0.85
usage_ratio <= effective_maximum
```

默认优秀目标：

```text
global_minimum = 0.85
target = 0.92
effective_maximum = min(模板上限, 0.98)
```

模板 manifest 中原有的 80% 或 52% 最低值不能降低产品的全局 85% 硬门槛：

```text
effective_minimum = max(0.85, template.minimum)
```

稀疏模板可以使用，但使用稀疏模板的最终简历仍必须达到 85%。

### 5.2 bullet 尾行门槛

每个 bullet 使用真实 DOM 测量：

```text
last_line_ratio = last_line_width_px / available_line_width_px
last_line_ratio >= 0.6671
```

`0.6671` 用于明确满足“严格大于 66.7%”，不能向上取整。单行 bullet 同样适用。
任何 bullet 缺少测量值、ID 重复或尺寸无效都必须失败关闭。

在不牺牲真实性和语言质量的前提下，默认优秀目标为所有 bullet 的最低尾行比例至少
`0.75`。`0.75` 是优化目标，不替代 `0.6671` 保存硬门槛；来源不足时不得通过编造或
机械填充追求目标值。

### 5.3 字体门槛

- 中文字符：SimSun / 宋体；
- 拉丁字母、数字和英文标点：Times New Roman；
- 字体通过本地受控 `@font-face` 资产加载；
- 使用 `unicode-range` 或等价的明确字符分配；
- 测量前必须等待 `document.fonts.ready`；
- 必须分别执行 `document.fonts.check(...)`；
- 字体 checksum 必须与版本化模板契约一致；
- fallback font 不能产生可保存的测量结果。

### 5.4 来源门槛

- 每个工作或项目 bullet 至少引用一个当前 revision 的精确原文片段；
- quote、UTF-16 start/end、经历 ID、revision ID 和 content hash 必须互相一致；
- `matched_jd_requirement_ids` 必须属于当前目标 JD；
- 数字、技术、日期、组织、范围、角色和结果必须由引用原文支持；
- 相同或明显重叠的原文范围默认只能被一个最终 bullet 消费；
- 不允许通过同义改写重复使用同一段证据填充页面；
- 来源经历 revision、JD version 或模板 profile 变化后，旧候选和测量立即失效；
- 来源不足时应省略内容或向用户定向追问，不能为了页面占比编造。

## 6. 真实性与表达增强边界

系统内部不使用“允许夸张”作为可执行规则，而使用“事实不变的表达增强”。

允许：

- 使用更清晰、有力但不改变责任级别的动词；
- 压缩背景并突出已有行动、方法和结果；
- 强调与 JD 最相关的真实侧面；
- 将多个相互支持且属于同一经历的事实组织成一句；
- 使用来源中的准确数字；
- 根据来源中同时存在的输入值做可复算的简单推导，并保存推导依据。

禁止凭空增加：

- 百分比、用户数、收入、金额、团队规模或性能指标；
- 未使用过的技术、平台、工具或方法；
- “主导”“负责全部”“从 0 到 1”等不存在的责任范围；
- 客户、业务规模、获奖、排名或结果；
- 公司、学校、项目、职位和日期；
- 原事实中不存在的因果关系。

默认写作模式为 `grounded_strict`：允许改善表达，不允许新增原子事实。后续如增加
写作风格选项，只能改变语气和强调方式，不能降低来源门槛。

## 7. 像代码 Agent 一样工作的 Resume Workspace

### 7.1 类比关系

| 代码 Agent | 简历生成 Agent |
| --- | --- |
| 工作区文件 | 内存中的结构化候选简历 |
| `apply_patch` | `patch_resume_candidate` |
| 编译器 | 隔离的 Chromium 简历渲染器 |
| 单元测试/CI | 来源、页面、字体和尾行质量门 |
| 编译错误 | 带稳定 ID 和像素数据的布局诊断 |
| 测试全部通过 | `ready_for_approval` |

Agent 可以自行规划和修改，但不能自行宣布成功。只有确定性质量门可以把候选标记为
`ready_for_approval`。

### 7.2 Workspace 状态

```ts
interface ResumeWorkspace {
  candidateId: string;
  sourceSnapshot: ResumeSourceSnapshot;
  templateSnapshot: ResumeTemplateSnapshot;
  structured: ResumeStructure;
  evidenceLedger: ResumeEvidenceLedger;
  measurements: ResumeMeasurements;
  bestSnapshot: ResumeCandidateSnapshot;
  revisionRound: number;
  status:
    | "planning"
    | "writing"
    | "needs_revision"
    | "ready_for_approval"
    | "failed";
}
```

生成内核阶段的候选保存在当前任务内存。G7 的宿主层可以把可恢复工作稿和本地检查点加密
持久化，但恢复后必须刷新来源并重新验证；任何 patch 仍通过稳定 ID 执行，不允许模型提交
整份 HTML 或任意 JSON 覆盖。

### 7.3 证据账本

```ts
interface ResumeEvidenceLedger {
  reservedSourceRanges: SourceEvidenceExcerpt[];
  coveredRequirementIds: string[];
  bullets: Array<{
    bulletId: string;
    text: string;
    sourceExperienceId: string;
    excerpts: SourceEvidenceExcerpt[];
    matchedRequirementIds: string[];
    normalizedClaims: string[];
  }>;
}
```

账本用于确定性阻止证据范围复用和内容重复。模型看到完整前文仍然是必要的，但不能代替
账本和重复检测。

## 8. 优化后的端到端生成链路

### 阶段 A：刷新并锁定输入快照

生成前从普通业务 API 获取最新：

- 用户资料；
- 目标 JD 和 requirement IDs；
- 候选经历元数据和当前 revision；
- 当前 revision 的完整正文、ID 和 content hash；
- 已有简历（修改任务时）；
- 模板 manifest、profile 和字体 checksum。

创建 `source_snapshot_hash`。生成期间任一来源版本变化时，停止保存并要求基于最新数据
重算，不能把过期证据写入正式版本。

### 阶段 B：创建固定骨架并测量固定成本

程序创建基本信息、教育经历和固定 section 标题，使用选定模板在 Chromium 中渲染空
骨架，得到：

```text
available_content_height_px
fixed_height_px
remaining_narrative_height_px
body_line_height_px
每增加一个 item 的固定高度
每增加一个 section 的固定高度
```

这一步给 Agent 提供真实页面预算，而不是字符数预算。

模板首选由程序根据真实素材量确定。模板和 `layout_tuning` 在主要内容生成期间保持固定，
避免后续修改引起全部已通过 bullet 重新换行。确需切换模板时，必须使全部旧测量失效并
完整重测。

### 阶段 C：来源选择和内容计划

Pi Agent 结合 JD 对当前 revision 原文中的可引用内容计算基础价值：

```text
JD requirement 相关性
+ 事实强度和具体程度
+ 有来源的结果或影响
+ 有来源的数字和技术
+ 与已选事实的信息增量
+ 适度时间相关性
- 重复和近重复惩罚
```

Pi Agent 在这些结果上决定：

- 使用哪些工作和项目经历；
- 每段经历的优先级；
- 初始 bullet 数量和建议视觉行数；
- 哪些 must-have requirement 需要优先覆盖；
- 给后续项目和技能保留多少空间。

计划不是最终文本，也不能绕过真实渲染。

### 阶段 D：带完整前文的自适应增量写作

每次模型继续写作时都必须携带：

- 当前已生成简历的完整可见文本；
- 当前经历已有的全部 bullet；
- 已引用的原文 quote/offset 范围；
- 已覆盖和未覆盖的 JD requirements；
- 当前可用的未引用高价值原文片段；
- 页面像素预算和估计视觉行预算；
- 当前最低尾行比例和失败项；
- 下一写作位置的 section/item ID。

为了兼顾上下文一致性和 token/调用次数，采用自适应写作粒度：

1. 页面使用率较低、空间充足时：一次生成一段经历的 2 至 4 条有序 bullet；
2. 同一响应中的后续 bullet 天然能看到前面已经生成的 bullet；
3. 每完成一个经历或小批量即写入 Workspace 并真实测量；
4. 接近 85% 下限、90% 目标或页面上限时，缩小为一次生成/修改一条 bullet；
5. 不一次生成整份简历的多套文案；
6. 每次新的物理模型调用都传入此前已经接受的完整简历文本。

这既满足“后文必须结合完整前文生成”，又避免每条 bullet 都重复发送全部经历原文。
完整经历原文在 snapshot 建立时发送；后续局部轮次只发送必要证据片段及 revision/hash。

### 阶段 E：每次写入后的编译与测试

每次 `patch_resume_candidate` 自动执行：

```text
patch schema 校验
→ 来源和 claim 校验
→ 原文证据范围/重复检测
→ 更新结构化候选
→ 等待字体和 DOM 稳定
→ Chromium 真实测量
→ 更新证据账本和页面预算
→ 与最佳快照比较
→ 返回精简诊断
```

工具返回的页面诊断至少包含：

```ts
interface ResumeBudgetDiagnostic {
  usedHeightPx: number;
  availableHeightPx: number;
  usageRatio: number;
  pxToMinimum: number;
  pxToTarget: number;
  pxBeforeOverflow: number;
  estimatedBodyLinesRemaining: number;
}
```

不能只返回“还剩多少 px”。同时返回：

- 距离 85% 下限还差多少；
- 距离 90% 目标还差多少；
- 距离溢出还剩多少；
- 约等于多少正文视觉行；
- 新增一个 item 或 section 的固定成本；
- 哪些 must-have requirement 尚未覆盖；
- 哪些未引用原文最适合填补当前缺口。

### 阶段 F：编译器式失败诊断

诊断必须定位到稳定 ID，不能只返回“排版不合格”。

主要错误类型：

```text
unsupported_claim
invalid_source_excerpt
stale_source_revision
duplicate_source_range
duplicate_or_near_duplicate_bullet
missing_jd_requirement
page_underfilled
page_overfilled
page_overflow
multiple_pages
bullet_tail_too_short
font_not_loaded
template_profile_mismatch
```

尾行失败报告包括：

```text
bullet_id
line_count
last_line_width_px
available_line_width_px
required_width_px
deficit_px
可用 source excerpts
建议方向：精简至少一行 / 从来源补足 / 与相邻 bullet 重组
```

Agent 根据诊断自行选择下一步：增加事实、停止当前经历、给项目留空间、压缩一行、
从来源补足、删除低价值内容或结束生成。

### 阶段 G：有界局部修复

修复遵循以下优先级：

1. 来源、revision、claim 和重复问题；
2. 未覆盖的 must-have JD requirement；
3. bullet 尾行失败；
4. 页面溢出或多页；
5. 页面低于 85%；
6. 在所有硬门槛通过后优化到接近 90%；
7. 最后才考虑模板允许范围内的 spacing tuning。

修复规则：

- 默认冻结已经通过且质量良好的 bullet 和 section；
- 一轮只处理最高优先级的少量失败点；
- 同一批失败 bullet 可以在一次模型调用中共同返回 alternatives；
- 每个失败点最多生成 2 至 3 个局部 alternatives；
- alternatives 必须保持原文证据绑定和原子事实不变；
- 工具负责展开少量组合、真实渲染、排名并选择最佳快照；
- 最多 3 轮外层修复；
- 任一新版本变差时保留或回滚到此前最佳快照；
- 不允许触发整份简历重写。

### 阶段 H：字典序候选排名

中间候选使用硬约束优先的字典序，不使用一个可互相抵消的总分：

```text
1. 来源和所有 claims 是否有效
2. 字体和模板是否有效
3. 是否单页以及 overflow 大小
4. 未通过尾行门槛的 bullet 数量
5. 最低 last_line_ratio
6. 是否达到 85%
7. 与 90% 目标的距离
8. must-have requirement 覆盖
9. 事实强度、内容多样性和语言质量
```

`bestSnapshot` 始终保存本轮任务中最好的完整候选。任何修复不能只覆盖最后版本而丢失
历史最佳状态。

### 阶段 I：最终质量门和保存审批

最终 gate 重新执行全部来源和真实 DOM 检查。通过后候选进入：

```text
ready_for_approval
```

`prepare_resume_save` 创建不可变 Proposal，确认卡展示：

- 简历标题、目标岗位和 JD；
- 新建简历或新增版本；
- 页面数和页面占用率；
- 最低 bullet 尾行比例；
- 字体检查；
- 模板/profile/hash；
- 事实和 requirement 覆盖摘要；
- 将创建或影响的云端固定资产。

用户接受后由 `ResumeSaveExecutor`：

1. 创建简历或 staged variant；
2. 提交 `structured`、确定性生成的 `content` 和原始布局观察；
3. 由服务端重新验证来源和布局观察；
4. 服务端通过后设置 active variant；
5. 服务端拒绝或来源变化时回到本地重新验证，不能强制发布。

## 9. Agent 工具设计

### 9.1 读取工具

- `get_user_profile`
- `list_jds` / `get_jd`
- `search_experiences` / `get_experience`
- `get_resume_source_snapshot`
- `list_resumes` / `get_resume`

`get_resume_source_snapshot` 返回当前 revision 正文、revision/content hash、可引用 JD
requirement IDs 和模板版本。每个候选 bullet 再通过精确 quote 与 UTF-16 start/end 绑定证据。
该工具只组合普通业务 API，不调用其他 Agent。

### 9.2 三个核心写作工具

#### `prepare_resume_candidate`

- 创建内存 Resume Workspace；
- 锁定来源和模板快照；
- 注入固定基本信息、教育经历和 section 标题；
- 接受经历选择计划和可选的第一批 bullets；
- 执行来源校验、真实渲染和首次测量；
- 返回 candidate ID、完整当前预览、证据账本和页面预算。

#### `patch_resume_candidate`

类似简历版 `apply_patch`，支持：

- 增加、替换、删除或移动 bullet；
- 增加、删除或移动有来源的经历 item；
- 更新技能项；
- 提交同一失败目标的少量 alternatives；
- 在明确规则下切换模板或使用允许的 tuning。

每次 patch 后自动验证和测量，不单独暴露 `measure_resume`。

#### `prepare_resume_save`

只允许质量门已经通过的候选调用。该工具只创建保存 Proposal，不直接写云端。

## 10. Chromium 渲染器

### 10.1 统一渲染原则

同一个本地模板必须用于：

- 增量生成期间的隐藏测量；
- 最终质量门；
- App 简历预览；
- PDF 打印；
- 固定回归测试。

不能为测量、预览和 PDF 维护三套 DOM 或 CSS。

### 10.2 直接使用 Electron 内置 Chromium

生产环境不额外安装 Chrome，也不自行实现 PDF 排版引擎。Electron 已经包含 Chromium。
新增一个专用、隐藏且隔离的 Resume Renderer `webContents`：

```text
Electron Main Process
  ├─ Resume Renderer（本地模板、隐藏、无网络、用于测量和 PDF）
  └─ Job Browser WebContentsView（远程招聘网站、用于浏览和填表）
```

二者共享 Electron 自带的 Chromium runtime，但必须使用不同的 WebContents、不同的
session partition 和不同权限。

Resume Renderer 安全要求：

- 只加载 App 打包的本地 HTML、CSS、字体和结构化数据；
- `nodeIntegration: false`；
- `contextIsolation: true`；
- 启用 sandbox；
- 禁止导航到外部地址；
- 拦截并拒绝网络请求；
- 不共享招聘网站 Cookie、localStorage 或权限；
- 不运行模型生成的 HTML 或 JavaScript；
- 销毁或复用前清空任务数据。

### 10.3 CLI 和测试

生成内核依赖 `ResumeRenderer` port，不直接 import Electron。正式 App 使用
`ElectronResumeRenderer`。CLI/CI 可以通过项目已经安装的 Electron binary 启动一个
最小隐藏 renderer worker，避免生产包再引入第二套 Chromium。

如果后续采用 Playwright 只用于开发测试，不把其浏览器二进制打入正式 App。

## 11. PDF 打印方案

### 11.1 结论

PDF 直接由 Chromium 打印生成，可以实现，不需要 App 自己绘制 PDF，也不需要
ReportLab、Canvas PDF 或手工拼接 PDF 对象。

简历模板使用：

```css
@page {
  size: A4 portrait;
  margin: 0;
}

@media print {
  html,
  body {
    margin: 0;
    padding: 0;
  }

  .resume-page {
    width: 210mm;
    height: 297mm;
  }
}
```

Electron 主进程调用：

```ts
const pdfBuffer = await resumeWebContents.printToPDF({
  pageSize: "A4",
  landscape: false,
  displayHeaderFooter: false,
  printBackground: true,
  scale: 1,
  margins: { marginType: "none" },
  preferCSSPageSize: true,
});
```

这样 Chromium 使用与预览和布局测量相同的 DOM、CSS 和字体进行分页及打印。

### 11.2 PDF postflight

浏览器打印完成后仍执行不依赖模型的 postflight：

- PDF 可以正常解析；
- 页数严格等于 1；
- 页面尺寸为 A4；
- 文本层存在且没有全部栅格化；
- SimSun 和 Times New Roman 已嵌入或以子集字体存在；
- PDF 中关键文本与 `structured` 一致；
- 导出前后的 template/profile/hash 和 candidate hash 一致；
- 失败时不把文件标记为成功导出。

自动测试将 PDF 渲染为 PNG 做视觉回归，检查截断、重叠、黑块、字体缺失和布局漂移。
解析和视觉校验不等于自行生成 PDF；PDF 的实际生成仍完全交给 Chromium。

### 11.3 与未来内置浏览器的关系

提前使用 Electron Chromium 是合理的，也能为未来 BrowserAdapter 积累 WebContents、
session、生命周期和权限隔离经验。但简历打印器与招聘网站浏览器必须是两个组件：

- 简历打印器处理可信的本地模板；
- 招聘网站浏览器处理不可信的远程页面；
- 两者不互相读取 DOM；
- 招聘页面不能修改简历模板或打印参数；
- 简历渲染器不能获得招聘网站登录态。

## 12. 性能和 token 优化

1. Workspace 保存完整候选，模型只提交 patch，不反复输出整份结构化 JSON。
2. 每次模型调用携带完整已生成简历文本，但不重复携带全部经历正文。
3. 未引用来源只发送当前最相关的一小组原文片段及其必要定位信息。
4. 页面空间充足时按经历生成小批量；接近边界时按单 bullet 精细生成。
5. 工具结果默认返回差量诊断，首次创建和用户请求时才返回完整预览。
6. 测量结果按以下 key 缓存：

```text
hash(structured + profile_hash + font_checksums + chromium_version)
```

7. 已通过区域冻结，局部修复不把完整来源重新发送给模型。
8. 相同物理模型调用中的多个 bullet 使用有序输出，后续 bullet 自然看到前文。
9. 局部失败可以合并为一次修复请求，避免逐条模型调用。
10. 达到所有硬门槛且内容质量目标后立即停止，不为了追求像素上的绝对 90% 继续改写。

## 13. 失败和用户决策

以下情况停止自动生成并给出可解释结果：

- 字体或模板资源不可用；
- current revision 正文缺失或来源版本失效；
- 当前真实素材无法在不编造的前提下达到 85%；
- 三轮局部修复后仍有硬门槛失败；
- must-have requirement 没有任何真实来源；
- 用户要求与一页硬门槛发生不可解决的冲突；
- 保存确认期间来源 revision 或模板 profile 已变化。

向用户返回：当前最佳版本、剩余失败项、缺少的事实类型、需要补充的大致页面高度或
视觉行数，以及可以选择删除或补充的具体内容。不允许静默降低门槛。

## 14. 可观测性

每次生成至少记录本地诊断，不记录隐藏思维过程：

- 输入经历、证据片段和 requirements 数量；
- 来源和模板 snapshot hash；
- 使用与淘汰的原文范围及原因；
- 每次模型调用用途、耗时、输入/输出 token；
- 每次 patch 的目标 ID 和操作类型；
- 每轮页面使用率、overflow、最低尾行比例；
- 未通过尾行的 bullet 数量；
- 是否触发模板切换、局部修复或回滚；
- 最终状态和失败原因；
- 从请求到 ready-for-approval 的总耗时。

这些过程数据只保存在本地诊断范围，不作为 Web/App 共享固定资产。

## 15. 测试与评测

### 15.1 领域单元测试

- 固定栏目和固定标题；
- 工作与实习合并；
- 教育和来源字段不可被模型修改；
- stable ID 和 revision 失效；
- 原文范围消费账本；
- 精确及近重复 bullet 拒绝；
- 数字、技术和责任级别来源检查；
- 候选字典序排名和最佳快照回滚；
- 85% 全局门槛不能被模板最低值降低。

### 15.2 Chromium 布局回归

- 中文、英文和中英混排；
- 单行和多行 bullet；
- `0.6671` 边界上下样例；
- 84.99%、85%、90% 和 overflow 边界；
- 长英文 token、URL、技术名和数字；
- 字体未加载、checksum 错误和 fallback；
- 标准模板与稀疏模板；
- 固定 Chromium 版本下的确定性重放。

### 15.3 Agent 评测

- 后续 bullet 是否结合完整前文；
- 是否重复使用相同事实；
- 是否覆盖新的 JD requirement；
- 是否会在页面已经接近上限时继续添加低价值内容；
- 是否优先修复编译器指出的具体失败项；
- 是否会为了页面占比编造事实；
- 是否在三轮上限后停止并请求用户决定；
- 是否尝试绕过模板、字体或保存审批。

### 15.4 PDF 验收

- Chromium 输出文件可解析；
- 严格一页 A4；
- 中英文字体嵌入；
- 文本可选择和搜索；
- 无截断、重叠、黑块或额外空白页；
- DOM 预览和 PDF 视觉回归处于允许误差；
- 导出失败不会留下被标记为成功的正式文件。

## 16. 实施阶段

截至 2026-07-23，G0–G4 已完成，G6 的无保存对话框 PDF 编译与 postflight 基础也已完成。
G4 确定性门禁、真实 Chromium 局部候选修复和真实 DeepSeek 中文/英文/来源缺失三样本评测
均已通过；offset 优化后的三样本均一次 prepare 完成，下一阶段进入 G5。

### G0：冻结契约和回归样例

状态：已完成。

- 确认全局页面硬门槛为至少 85%；默认优秀目标后续调整为 92%；
- 冻结固定 section 标题、顺序和隐藏规则；
- 冻结 `ResumeStructure`、source snapshot、Workspace、measurement 和 Proposal 类型；
- 同步模板 manifest 和字体资产；
- 建立中英文固定回归简历。

### G1：只读来源和证据门禁

状态：已完成。

- 接入用户资料、JD 和经历 current revision 普通业务 API；
- 实现 source snapshot 和 revision 失效；
- 实现 quote/offset evidence ledger、数字来源和重复范围检测；
- 提供 profile、JD 和 source snapshot Agent 只读工具。

### G2：Electron Chromium 编译器

状态：已完成；编译器已接入 G3 Workspace 与 Agent 工具。

- 实现隔离的隐藏 Resume Renderer；
- 加载受控模板和字体；
- 实现固定骨架测量、页面测量和 `Range.getClientRects()` 尾行测量；
- 实现 layout gate、缓存和布局回归；
- 先提供 CLI/测试可调用的最小 renderer worker，不依赖完整前端页面。

### G3：本地增量生成闭环

状态：已完成。

- 实现 `prepare_resume_candidate`；
- 实现自适应按经历/按 bullet 写作；
- 每轮携带完整已生成内容、证据账本和页面预算；
- 实现 `patch_resume_candidate` 的稳定 ID patch；
- 实现编译器式诊断、冻结区域和最佳快照。

### G4：优秀简历质量与局部修复

状态：已完成。

- 实现 JD 覆盖、事实价值和信息增量排序；
- 实现最多 3 轮局部 alternatives；
- 实现页面过空、溢出和尾行定向修复；
- 建立 Agent 回归评测和 token/延迟基线；
- 达到本文全部生成质量验收标准。
- 真实 `deepseek-v4-flash` 三样本 3/3 通过；优化后 12 次模型调用、0 次工具失败、
  Provider total token 81,185、端到端 47.26 秒。

### G5：保存和跨端互通

状态：已完成。

- 后端增加创建 staged variant、通用 verify/accept/reject 产品 API；
- 实现 `prepare_resume_save` 和 `ResumeSaveExecutor`；
- 接入现有 Action Approval；
- 验证 App 保存后 Web 可以读取和渲染，Web 版本也可被 App 读取。
- 真实测试账号完成新 Resume 与新 variant 两条发布路径；服务端重放 18 条来源证据，Web 产品
  API 与 App reader 的 active structured 完全一致。

### G6：PDF 打印

状态：已完成。

- 复用同一个 Electron Resume Renderer；
- 实现 `printToPDF` 和 PDF postflight；
- 实现系统保存位置选择；
- 建立 PDF 页面、字体和视觉回归。
- 支持 `ready_for_approval` candidate 与正式 active published variant；用户接受 Action Approval
  后才弹系统保存对话框。
- 真实 Chromium、内置 postflight、Poppler 和 144 DPI PNG 视觉检查全部通过。

### G7：App 前端功能和界面

状态：首轮实现完成并通过质检；产品决策见
[G7 产品与实施计划](../08-g7-app-ui/g7-product-plan.md)，结果见
[G7 实施结果](../08-g7-app-ui/g7-implementation-result.md)。

- 左侧 Agent 对话、右侧可展开/收起的 A4 简历 Canvas；
- Canvas 支持直接文字编辑，并可拖拽 bullet/经历到聊天区交给 Agent 修改；
- AI 修改以待确认版本展示，Canvas 下方提供接受/拒绝；
- 自动加密保存本地工作稿，聊天 Artifact 卡片可恢复对应本地简历；
- App 提供独立本地检查点和回退；产品不提供云端版本列表、回退或 diff；
- 固定资产字段默认只读，尝试编辑时解释原因并提供聊天修改入口；
- 接受 AI 修改只更新本地工作稿，只有“保存/更新到云端”才创建新 Resume 或更新其云端当前内容；
- 持续展示本地草稿、云端当前内容和导出文件的状态区别；
- 删除聊天时保留关联本地简历草稿，后续通过左侧栏独立入口访问；
- G7 沿用现有 App 主题和组件；卡片/区域的可见背景与边框互斥；
- AI 修改采用低透明度绿色荧光笔高亮，不使用边框式高亮；
- 高级详情只显示页面占比、最低尾行、事实完整性和 JD 覆盖；
- 高级详情、保存到云端、导出在 Canvas 展开后显示于展开/收起按钮左侧同一行；
- 不提供独立“继续优化版面”按钮，后续优化通过聊天继续。

## 17. 完成定义

“优秀简历生成”阶段只有同时满足以下条件才算完成：

- 本地 Pi Agent 在一次用户对话中完成有界生成、编译、修复和验收循环；
- 固定栏目、固定标题和教育经历由程序控制；
- 后续内容始终基于完整已生成前文和证据账本；
- 所有 bullet 均有当前 revision 的真实来源；
- 没有无来源数字、技术、责任级别或结果；
- 页面严格一页且占用率至少 85%；
- 每个 bullet 最后一行比例至少 0.6671；
- 中文、英文和数字使用规定字体且字体实际加载；
- 常规生成不预先创建大量文案候选，不进行整份重写；
- 最多 3 轮局部修复后要么通过，要么给出明确用户决策；
- 未通过质量门的候选不能进入保存审批；
- 用户接受前没有云端写入；
- 服务端复验失败的版本不能成为 active；
- App 保存的正式版本能被 Web 直接读取和渲染；
- Chromium 打印得到严格一页、字体正确的 A4 PDF；
- 完成生成内核后，才开始大规模修改 App 前端功能和界面。
