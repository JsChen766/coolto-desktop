# Coolto 本地简历生成设计

> 后续产品语义（2026-07-24）：本文的 `ResumeVariant`、版本链、staged/accept 和
> `active_variant_id` 保留为 G5 发布内核的技术设计。产品上每份云端 Resume 只暴露
> 当前 active 内容，不提供云端版本历史、回退或 diff；历史回退只来自本地
> `ResumeDraftStore` 检查点。若与后续 P0 产品路线表述冲突，以该决策为准。

> 状态：历史设计草案；其中 Fact Bank、`source_fact_ids` 和 `get_resume_source_context`
> 相关方案均已由 G1 v1.1 的 current revision snapshot、原文 quote/offset 与
> `get_resume_source_snapshot` 方案取代  
> 版本：v0.3  
> 日期：2026-07-23  
> 关联文档：`coolto-agent-core-design.md`、`coolto-architecture-plan.md`

> 后续实施以 `coolto-resume-generation-implementation-plan.md` v1.0 为准。该计划在本
> 文基础上冻结了固定栏目、85% 全局页面门槛、带完整前文的自适应增量写作、事实账本、
> Chromium 编译闭环以及 Electron `printToPDF` 方案。

## 1. 目标

在桌面 App 的本地 Pi Agent 中复刻 Web 端的简历生成能力，同时保持单
Agent、少工具、无 LangGraph 的结构。

生成结果必须：

1. 通过同一个后端和数据库保存为 Web 端现有的简历版本格式。
2. APP 的模板、字体和布局参数与 Web 端保持一致。
3. 最终只占一页。
4. 每个 bullet 最后一行的实际宽度严格大于可用行宽的 66.7%。
5. 中文使用宋体，英文和数字使用 Times New Roman。
6. 内容能够追溯到用户的真实经历和事实。
7. 只有经过用户确认且通过质量门槛的版本才能写入云端并成为正式版本。

本地生成的正式简历属于“固定资产”，保存后由云端数据库管理，因此 Web
端和桌面 App 可以读取同一个简历及版本。

## 2. 非目标

第一阶段不做：

- 在桌面 App 中调用云端 LangGraph。
- 为简历生成建立 Router、Planner、Reviewer 等多 Agent 或多节点工作流。
- 在本地持久化经历、JD 或正式简历副本。
- 允许模型直接编辑 HTML、CSS、模板 ID、模板哈希或字体。
- 允许模型直接调用“保存到云端”接口。
- 为每一种排版问题创建一个单独的 Agent 工具。
- 自动投递简历。

## 3. 当前后端最终产物

当前 CVAgent 后端的正式简历不是一段 Markdown 或一个 PDF，而是一个带版本的
`ResumeVariant`。其中：

- `structured` 是简历画布和渲染的唯一事实来源。
- `content` 是从 `structured` 确定性生成的 Markdown。
- `parent_variant_id` 和 `version` 构成版本链。
- `gate_status` 表示排版门槛结果。
- `publication_status` 表示候选版本是否已发布。
- `active_variant_id` 指向用户当前采用的正式版本。

桌面 App 应继续产出同一种 `structured`，通过普通业务 API 写入同一个云端简历和
版本表，而不是设计第二套本地简历格式或本地持久化格式。

这里不要求从 Web 项目提取一层新的“共享契约包”。现有后端的存储模型和 API
响应就是互通边界：

```text
Web 生成器 ─┐
            ├─→ 同一个简历业务 API ─→ Resume / ResumeVariant ─→ 云端数据库
APP 生成器 ─┘
```

两个生成器可以完全独立。只要 APP 保存的 `structured`、版本字段和状态语义与
Web 端现有记录一致，Web 就可以直接读取 APP 生成的版本，APP 也可以直接读取 Web
生成的版本。

### 3.1 结构化简历的核心字段

```ts
interface ResumeStructure {
  language: string;
  contact: ResumeContact;
  sections: ResumeSection[];

  layout_template_id: "resume-standard" | "resume-sparse";
  layout_profile_version: string;
  layout_profile_hash: string;
  layout_tuning: LayoutTuning;

  layout_usage_ratio?: number;
  layout_target_band?: { min: number; target: number; max: number };
  quality_status?: string;
  quality_issues?: string[];
}

interface ResumeSection {
  id: string;
  type:
    | "summary"
    | "education"
    | "experience"
    | "project"
    | "skills"
    | "other";
  heading: string;
  items: ResumeSectionItem[];
}

interface ResumeSectionItem {
  id: string;
  title: string;
  organization: string;
  role: string;
  location?: string;
  start_date: string;
  end_date: string;
  source_experience_id: string;
  bullets: ResumeBullet[];
  raw_text: string;
}

interface ResumeBullet {
  id: string;
  text: string;
  source_fact_ids: string[];
  matched_jd_requirement_ids: string[];
}
```

联系信息、经历名称、组织、角色、地点和日期由程序从用户资料及经历数据中注入。
模型只负责选择事实、组织章节和撰写 bullet，不应有机会篡改这些来源字段。

## 4. 模板一致性

### 4.1 模板基准

APP 以 Web 端当前的 `resume-layout-templates-v1`、模板 CSS 和字体资产作为复刻
基准，但不要求运行时共享 package。

当前实际生效的模板包括：

| 模板 | 页面 | 页边距 | 页面占用率范围 |
| --- | --- | --- | --- |
| `resume-standard` | A4 | 9 mm | 80%–95%，目标 88% |
| `resume-sparse` | A4 | 14 mm | 52%–90%，目标 68% |

旧设计资料中出现过“至少占用 90%”的口径，但当前运行代码和模板清单不是这个
值。实现时不得复制旧文档中的阈值，也不得在 Agent 工具中写死阈值；版本化模板
清单是唯一权威来源。

### 4.2 APP 独立实现

APP 可以自行实现简历生成、结构组装、布局优化、DOM 测量和 PDF 导出代码。这样
可以针对本地 Agent 做得比 Web 端更好，也不会被 Web 端当前生成流程限制。

为了保证最终视觉格式一致，APP 仓库中保留一份经过核对的模板实现和字体资产：

```text
src/resume/template/
├── resume-document.ts
├── resume-layout-templates-v1.json
├── styles.css
└── fonts/
    ├── simsun.ttc
    └── times.ttf
```

这里复制的是最终模板定义和字体，不复制 Web 端的 Agent、LangGraph 或生成算法。
APP 可以用更清晰的 TypeScript 代码重新实现渲染与测量。

为防止模板逐渐漂移，增加自动一致性测试：

- 模板 ID、profile version 和 profile hash 与后端当前值一致。
- 字体文件 checksum 与 Web 端一致。
- 固定回归简历在 Web 和 APP 中的关键行宽、页数和 section 位置误差处于允许范围。
- 模板升级时显式升级 APP 中的模板文件和 profile，而不是静默使用新规则。

每个正式版本都保存：

- `layout_template_id`
- `layout_profile_version`
- `layout_profile_hash`
- `layout_tuning`

这样旧版本即使在模板升级后也能知道自己由哪一版布局规则生成。

### 4.3 字体规则

APP 模板使用已有字体文件，并用 `unicode-range` 区分字符：

- 中文字符：SimSun，即宋体。
- 拉丁字母、数字和英文标点：Times New Roman。
- 页面默认字体族：`"Times New Roman", "SimSun", serif`。

布局测量前必须等待 `document.fonts.ready`，并确认两种字体均成功加载。只设置
CSS 字体名称但字体文件未加载，不能视为通过。

## 5. 必须执行的质量门槛

### 5.1 内容门槛

在排版前先做确定性校验：

- `source_experience_id` 必须属于当前用户。
- `source_fact_ids` 必须存在于该经历的当前 revision。
- bullet 中的数字、技术和明确事实必须能从引用事实中得到支持。
- `matched_jd_requirement_ids` 必须属于目标 JD。
- 不允许使用无效或重复的 bullet ID。
- 不允许为了填满页面机械重复事实或 bullet。
- 经历 revision 已变化时，旧候选版本必须失效并重新生成。

这些规则与后端现有简历质量门槛保持一致。服务端在保存候选版本时仍应重新校验，
客户端校验不能取代服务端校验。

### 5.2 一页门槛

以真实 Chromium 渲染后的 DOM 为准：

- 页面数必须等于 1。
- 页面底部溢出不超过模板允许的像素误差。
- 页面内容占用率必须处于所选模板的范围内。
- 模板 ID、profile version 和 profile hash 必须完全一致。

不能使用字符数、模型估算、Markdown 行数或普通文本换行来判断是否一页。

### 5.3 bullet 最后一行门槛

每个 bullet 都必须有稳定的 `data-bullet-id`。渲染后使用
`Range.getClientRects()` 获得实际视觉行，并计算：

```text
last_line_ratio = 最后一行实际像素宽度 / bullet 可用行宽
```

通过条件使用当前后端相同的安全阈值：

```text
last_line_ratio >= 0.6671
```

采用 `0.6671` 是为了明确满足“严格大于 66.7%”，避免浮点数和像素舍入把
`0.667` 误判为通过。单行 bullet 也适用同一规则。

客户端提交所有 bullet 的原始像素测量值，服务端重新计算通过与否。客户端和服务端
看到的 bullet ID 集合必须完全一致，不能漏掉不合格的 bullet。

### 5.4 PDF 后置校验

导出 PDF 时使用 APP 自己的确定性简历模板和 Chromium 打印能力。导出完成后执行
一次不依赖模型的 postflight：

- PDF 页数必须为 1。
- PDF 中必须存在 Times New Roman 和 SimSun 的嵌入字体或子集字体。
- 打印前后的模板/profile/hash 必须一致。

DOM 排版门槛负责判断换行和 bullet 宽度；PDF postflight 负责防止打印阶段产生
额外页或丢失字体。

## 6. Agent 可见的最小工具集

简历生成仍由当前唯一的 Pi Agent 完成。模型根据自然语言和工具说明决定调用顺序，
不额外增加意图识别节点。

### 6.1 数据读取工具

| 工具 | 作用 | 写入 |
| --- | --- | --- |
| `get_user_profile` | 获取姓名、邮箱、电话、所在地、个人链接 | 否 |
| `search_experiences` | 查找与目标岗位相关的经历 | 否 |
| `get_experience` | 获取选中经历的完整内容 | 否 |
| `get_resume_source_context` | 获取选中经历的稳定事实、revision 和可引用 ID | 否 |
| `list_jds` / `get_jd` | 读取目标 JD 及 requirement ID | 否 |
| `list_resumes` / `get_resume` | 读取已有简历和版本，用于修改任务 | 否 |

`get_resume_source_context` 是本地工具名。它可以组合已有业务 API，并调用后端新增的
事实读取接口，不要求后端建立新的 Agent 工作流。

### 6.2 候选版本工具

#### `prepare_resume_candidate`

模型提交简历内容计划，程序完成结构化、验证、真实渲染和测量。

模型输入只包含：

- 目标职位和可选 JD ID。
- 语言。
- section 的选择和排序。
- 每个 item 对应的 `source_experience_id`。
- bullet 文本、`source_fact_ids` 和 `matched_jd_requirement_ids`。

程序负责：

- 从资料中注入联系信息。
- 从经历中注入组织、角色、日期和地点。
- 创建稳定的 section、item 和 bullet ID。
- 选择当前模板和 profile。
- 执行内容校验。
- 在 Chromium 中使用与 Web 一致的 APP 模板渲染。
- 执行一页、占用率、字体和 bullet 最后一行门槛。
- 将候选版本保存在当前任务的内存中。

工具返回：

- `candidate_id`
- 简历预览数据
- 内容校验结果
- 页数、溢出量和页面占用率
- 每个 bullet 的最后一行比例
- 未通过项及可执行的修改建议

#### `patch_resume_candidate`

按稳定 ID 修改当前候选版本，并自动重新验证和测量。

允许的操作保持有限且确定：

- 替换、增加或删除 bullet。
- 调整 bullet、item 或 section 顺序。
- 增加或删除一个经历 item。
- 调整允许的 `layout_tuning`。
- 在标准模板和稀疏模板之间按规则切换。

模型不能通过该工具修改：

- 用户联系信息。
- 来源经历的组织、角色和日期。
- 模板清单。
- 字体。
- profile version/hash。
- 已引用事实的原始内容。

工具每次 patch 后自动完成“内容校验 → DOM 渲染 → 布局测量”。不再单独开放
`measure_resume` 工具，以减少工具数量和错误调用顺序。

### 6.3 写入确认工具

#### `prepare_resume_save`

只有同时通过内容门槛和 DOM 布局门槛的候选版本才能调用。

该工具不写云端，只创建不可变的保存 Proposal，并向现有通用审批系统发出待决策
事件。确认卡至少展示：

- 简历标题和目标岗位。
- 新建简历还是新增版本。
- 一页验证结果。
- 页面占用率。
- 最低 bullet 最后一行比例。
- 使用的模板/profile。
- 受影响的云端资源。

用户可以：

- 接受：执行保存。
- 拒绝：丢弃 Proposal，不写入。
- 自定义回答：旧 Proposal 失效，将反馈交回同一个 Agent 继续修改。

真正的云端写入由宿主内部 `ResumeSaveExecutor` 完成，不注册为模型可调用工具。

### 6.4 PDF 导出工具

#### `export_resume_pdf`

只允许导出已经通过门槛的候选版本或正式版本。该工具：

1. 使用 APP 的确定性模板渲染。
2. 通过 Chromium/Electron `printToPDF` 打印。
3. 执行 PDF postflight。
4. 通过系统文件选择器让用户决定保存位置。

导出属于本地文件写入，应使用现有审批/宿主控制通道；不上传聊天记录或 Agent
过程数据。

## 7. 自动修版流程

```text
用户自然语言要求生成简历
  → Agent 追问会实质影响结果的缺失信息
  → 读取用户资料、JD、经历和稳定事实
  → Agent 选择事实并撰写内容计划
  → prepare_resume_candidate
  → 程序执行内容校验和真实 DOM 测量
  ├─ 通过
  │    → 展示预览和门槛报告
  │    → prepare_resume_save
  │    → 用户接受
  │    → ResumeSaveExecutor 写入并让服务端复验
  │    → 激活正式版本
  └─ 未通过
       → Agent 根据具体失败项调用 patch_resume_candidate
       → 自动重新测量
       → 最多进行 3 轮定向修版
       → 仍失败则向用户说明冲突并请求取舍
```

不需要独立“排版 Agent”。同一个模型看到精确测量结果后修改文本即可。

修版顺序建议写入工具返回值和 System Prompt：

1. 先修复事实、引用和重复内容问题。
2. 再修复过短的 bullet 最后一行。
3. 页面过长时优先删减低相关性内容或压缩措辞。
4. 页面过短时优先补充已有高价值事实，不能编造内容。
5. 最后才在模板允许范围内调整字号、行高和间距。

### 7.1 比 Web 端更好的生成机制

APP 不复刻 Web 端的生成流程，只复刻最终存储格式和视觉模板。更好的部分由
`prepare_resume_candidate` 和 `patch_resume_candidate` 背后的本地生成代码实现。

#### 先规划页面预算，再写内容

生成前根据模板可用高度、section 数量和经历数量分配页面预算，给每个经历设置建议
bullet 数量及行数范围。这样可以减少“先写一大篇，再反复删到一页”的低效过程。

页面预算只是生成提示，不替代最终 Chromium 测量。

#### 内容选择先于措辞

先按照以下因素选择事实，再撰写 bullet：

- 与目标 JD requirement 的相关性。
- 事实的具体程度和结果强度。
- 是否包含可信数字或技术证据。
- 与其他已选 bullet 的信息增量。
- 对目标岗位能力覆盖的贡献。

低相关、重复和无法验证的内容不会因为方便排版而进入简历。

#### 对失败点做局部候选择优

某个 bullet 尾行过短时，只针对该 bullet 生成少量语义等价候选，不重写整份简历。
候选版本分别经过真实 DOM 渲染，再按以下顺序选择：

1. 事实和引用校验必须全部通过。
2. bullet 尾行和整页门槛必须通过。
3. 保留原始事实和关键数字的版本优先。
4. JD 相关性更高、表达更直接的版本优先。
5. 页面占用率更接近模板目标值的版本优先。

这不是增加一个新的 Agent，而是同一个工具内部的候选管理和确定性择优代码。

#### 始终保留当前最佳版本

`candidate-store` 不只保存“最后一次修改”，还保存当前任务中得分最高且通过最多
门槛的快照。一次修版如果使页面、事实或其他 bullet 变差，自动回滚到之前的最佳
快照，避免越改越差。

最佳版本比较采用硬门槛优先：

```text
事实有效
  > 一页
  > 所有 bullet 尾行通过
  > 字体通过
  > JD 覆盖和内容质量
  > 页面占用率接近目标
```

#### 冻结已经合格的区域

修版时默认冻结已经通过且内容质量良好的 section 和 bullet，只开放失败区域及其
相邻内容。只有整页过长或过短时才扩大修改范围。

这样能够减少模型在修复一个尾行时意外破坏其他已经合格内容的概率。

#### 每次修改都有可解释报告

工具返回修改前后对比：

- 哪些事实或 JD requirement 被保留、增加或移除。
- 哪些 bullet 文本发生变化。
- 每个变化如何影响尾行比例。
- 页数、占用率和最低尾行比例的变化。
- 为什么当前版本被选为最佳版本。

因此用户看到的不只是“生成成功”，而是可以确认它为什么满足门槛。

### 7.2 约束的形式化定义

生成器把每一份结构化简历视为候选版本 `C`，真实渲染后得到：

```ts
interface ResumeMeasurements {
  pageCount: number;
  overflowPx: number;
  usageRatio: number;
  fontsReady: boolean;
  fontChecks: {
    simsun: boolean;
    timesNewRoman: boolean;
  };
  bullets: Array<{
    bulletId: string;
    lineCount: number;
    availableWidthPx: number;
    lastLineWidthPx: number;
    lastLineRatio: number;
  }>;
}
```

最终可保存候选版本必须同时满足：

```text
source_validation = passed
page_count = 1
overflow_px <= allowed_tolerance
template_min_usage <= usage_ratio <= template_max_usage
fonts_ready = true
所有 bullet.last_line_ratio >= 0.6671
```

这些都是硬约束，不能相互抵消。例如，内容质量再高也不能接受两页；页面刚好一页也
不能接受尾行只有 40% 的 bullet。

内容质量只用于在“都满足硬约束”或“距离通过程度相同”的候选之间择优。

### 7.3 固定渲染环境

在开始优化前先固定以下变量：

- A4 页面尺寸、页边距和模板 CSS。
- Chromium 主版本。
- viewport、device scale factor 和打印参数。
- SimSun、Times New Roman 字体文件及 checksum。
- template ID、profile version、profile hash 和允许的 tuning 范围。

每次测量前执行：

```text
加载结构化简历
  → 等待 DOM 完成
  → 等待 document.fonts.ready
  → 检查两种字体确实可用
  → 再读取页面和文字 rect
```

同一个候选的测量缓存 key 使用：

```text
hash(structured + template_profile_hash + font_checksums + chromium_version)
```

只要其中任何一项变化，旧测量结果立即失效。

### 7.4 初始内容选择算法

#### 计算事实价值

生成前先给所有可用事实计算排序分数：

```text
fact_value =
  JD 相关性
  + 结果/影响强度
  + 具体程度
  + 数字或技术证据
  + 与已选事实的信息增量
  + 适度的时间相关性
```

其中 JD 相关性来自 `matched_jd_requirement_ids` 及 requirement importance；事实
有效性来自后端稳定 `source_fact_ids`。同一信息换一种说法不会因此获得两份价值。

#### 估算页面预算

先渲染只有联系信息和 section 标题的空白骨架，得到固定高度：

```text
可用于 item 和 bullet 的高度
  = 页面可用高度
  - 联系信息高度
  - section 标题和固定间距高度
```

再根据经历的事实价值分配初始 bullet 数量和行数预算。文字宽度可以先用加载了真实
字体的 `measureText` 做便宜的预估，但只用于减少候选数量，绝不作为最终门槛。

事实选择近似一个带页面成本的背包问题：

```text
在预估总高度不超过页面预算的情况下，
最大化事实价值、JD 覆盖和信息多样性。
```

这里不追求一次预估绝对准确，真实 DOM 会在下一步纠正误差。

### 7.5 初始 bullet 生成

Pi Agent 根据入选事实生成 bullet，每个 bullet 必须同时提交：

- `text`
- `source_experience_id`
- `source_fact_ids`
- `matched_jd_requirement_ids`

首轮不要求为整份简历穷举大量文案。每个高价值事实生成一个主表达；对预估接近换行
边界的 bullet 可以额外生成一个精简表达。

程序随后：

1. 注入不可由模型修改的组织、角色、日期和联系信息。
2. 分配稳定 ID。
3. 校验事实引用。
4. 生成标准 `ResumeStructure`。
5. 进行第一次真实渲染和测量。

### 7.6 像素级测量算法

#### 页面测量

```text
content_top    = 第一个简历内容元素顶部
content_bottom = 最后一个可见内容元素底部
page_bottom    = A4 内容区域底部

overflow_px = max(0, content_bottom - page_bottom)
usage_ratio = (content_bottom - content_top) / 可用内容高度
```

如果模板以分页容器渲染，还要同时确认只生成一个页面容器。

#### bullet 尾行测量

对每个具有稳定 `data-bullet-id` 的 bullet：

1. 为正文 text node 创建 `Range`。
2. 读取 `Range.getClientRects()`。
3. 按 rect 的垂直位置分组，得到浏览器实际视觉行。
4. 取最下面一组 rect。
5. 计算该组 rect 的横向 union 宽度。
6. 除以 bullet 正文区域的实际可用宽度。

```text
last_line_ratio =
  horizontal_union_width(last_visual_line_rects)
  / bullet_text_content_box_width
```

分母是模板中 bullet 正文的可用行宽，不包含项目符号和左侧缩进。这个口径与后端
当前布局门槛保持一致。

rect 分组使用很小的像素容差处理字体抗锯齿和小数坐标，但不能对最后比例进行向上
取整。最终按 `>= 0.6671` 判断。

### 7.7 失败分类与定向修复

测量后不向模型返回一句模糊的“排版失败”，而是归类为以下问题。

#### 页面溢出

记录需要减少的 `overflow_px`，按“内容价值 / 可节省高度”寻找修改目标：

1. 优先改写价值高但冗长的 bullet，目标是减少一个视觉行。
2. 删除低相关、重复或边际价值最低的 bullet。
3. 必要时减少低优先级 section 或 item。
4. 最后才使用模板允许的行高、间距 tuning。

不能通过缩小到模板范围之外的字体来作弊。

#### 页面过空

1. 从未使用事实中增加 JD 相关性最高的内容。
2. 恢复此前因篇幅移除但价值较高的 bullet。
3. 在事实支持下补足过于概括的结果或方法。
4. 如果标准模板天然过空，按现有规则使用稀疏模板。

不能编造新数字或用重复内容填充页面。

#### bullet 尾行过短

设：

```text
W = bullet 可用行宽
L = 当前最后一行宽度
T = 0.6671 × W
D = T - L
```

生成器同时考虑两种局部修复方向：

- 精简：删除冗余措辞，尝试把尾行文字拉回上一行，从而减少一个视觉行。
- 补全：只使用已有事实增加有价值的信息，使尾行至少补足约 `D` 像素。

工具会把当前行数、`L`、`W`、`D` 和建议目标行数返回给 Pi。Pi 针对同一个事实
生成 2 至 3 个语义等价候选，工具逐个真实渲染；不能仅按新增了多少字符判断。

如果补全会引入空话，选择精简；如果精简会丢失关键数字或结果，选择有事实支撑的
补全。两条路都不合格时再考虑相邻 bullet 的内容重新分配。

#### 字体失败

字体失败不通过改写内容解决。它属于模板资源或渲染环境错误，生成立即停止并报告，
防止使用 fallback 字体测量后得到虚假的合格结果。

### 7.8 有限宽度候选搜索

为了避免每个 bullet 有三个候选时产生指数级组合，使用小规模 beam search：

```text
beam_width = 4
每轮最多选择 1 至 2 个最重要失败点
每个失败点由 Pi 提供 2 至 3 个候选修改
每轮最多真实渲染少量组合
只保留排名最高的 4 个快照
外层修版最多 3 轮
```

`patch_resume_candidate` 支持一次提交同一目标的多个 alternatives：

```ts
interface ResumeCandidatePatch {
  candidate_id: string;
  targets: Array<{
    target_id: string;
    alternatives: Array<{
      operation: "replace_bullet" | "delete_bullet" | "add_bullet";
      text?: string;
      source_fact_ids?: string[];
      matched_jd_requirement_ids?: string[];
    }>;
  }>;
}
```

工具负责展开有限候选、校验、渲染、测量、排名和保存最佳快照。Pi 不需要手动逐个
调用测量工具，也不需要知道 Chromium 的实现细节。

### 7.9 候选排名

最终通过条件仍然是全部硬门槛同时满足。搜索过程中的中间候选使用字典序排名，而
不是把所有规则加成一个总分：

```text
1. 来源事实是否全部有效
2. 字体是否正确；字体失败时其他像素测量无效
3. 是否一页及 overflow_px
4. 未通过尾行门槛的 bullet 数量
5. 最低 last_line_ratio
6. 页面占用率与模板目标的距离
7. JD requirement 加权覆盖率
8. 事实强度、信息多样性和语言质量
```

字典序可以防止一个很高的“语言质量分”掩盖一页或尾行硬门槛失败。

一旦找到全部通过的候选，仍可以在剩余的小规模候选中选择内容质量更高者，但不能
为了软质量重新破坏任何硬门槛。

### 7.10 完整伪代码

```text
generate_resume(request):
  profile, experiences, facts, jd = load_latest_source_data(request)
  template = load_pinned_template_profile()
  assert_fonts_available(template)

  ranked_facts = rank_facts(facts, jd)
  page_budget = measure_empty_skeleton(template)
  selected_facts = select_facts(ranked_facts, page_budget)

  initial_content = pi_write_bullets(selected_facts, jd)
  initial_candidate = build_structure(initial_content, profile, experiences, template)
  beam = [validate_and_measure(initial_candidate)]
  best_snapshot = beam[0]

  for round in 1..3:
    if exists_fully_valid_candidate(beam):
      return best_fully_valid_candidate(beam)

    failures = classify_highest_priority_failures(beam)
    alternatives = pi_write_local_alternatives(failures)
    expanded = apply_limited_alternatives(beam, alternatives)
    measured = validate_and_measure_all(expanded)
    beam = keep_best_four(measured)
    best_snapshot = better_of(best_snapshot, beam[0])

  if best_snapshot is fully valid:
    return best_snapshot

  return needs_user_decision(best_snapshot, remaining_failures)
```

这里的 `pi_write_bullets` 和 `pi_write_local_alternatives` 由同一个 Pi Agent 在正常
tool loop 中完成，不是在工具内部再启动第二个 Agent。工具内部实现的是事实排序、
结构组装、候选展开、真实渲染、测量、排名、缓存和回滚。

## 8. 候选版本状态

```text
draft
  → validating
  → needs_revision
  → ready_for_approval
  → approved
  → staging_on_server
  → server_verified
  → published
```

任何来源经历 revision、JD version、模板 profile 或候选内容变化都会使之前的布局
观察结果失效，必须重新测量。

用户接受之前，候选版本只存在于当前本地任务内存，不提前创建云端 staged variant。
这样可以保证所有云端写入都经过用户确认。

用户接受后：

1. Executor 创建简历或新的 staged variant。
2. 将原始浏览器布局观察值提交给后端。
3. 后端重新执行内容和布局门槛。
4. 只有服务端返回 `passed` 时才把该版本设为 active。
5. 如果模板或来源数据在确认期间发生变化，保存失败并回到重新生成/确认流程。

## 9. 后端需要补充的最小能力

现有后端已经有简历、版本、结构化 patch 和 AI edit 的内部服务，但桌面 App 不应
调用 LangGraph 或冒充 Web Agent 流程。建议增加以下普通产品 API：

### 9.1 读取稳定事实

```http
GET /v1/product/experiences/{experience_id}/facts
```

返回当前经历 revision、revision hash、稳定 fact ID、事实文本和证据位置。该接口
只做鉴权和数据读取。

### 9.2 创建 staged variant

```http
POST /v1/product/resumes/{resume_id}/variants
```

接收经过确认的 `structured` 和确定性生成的 `content`，服务端重新校验来源引用，
创建 `publication_status=staged` 的版本。

### 9.3 通用布局验证与采用

```http
POST /v1/product/resumes/{resume_id}/variants/{variant_id}/verify-layout
POST /v1/product/resumes/{resume_id}/variants/{variant_id}/accept
POST /v1/product/resumes/{resume_id}/variants/{variant_id}/reject
```

现有 AI edit 的 verify/accept/reject 逻辑可以下沉为通用 service，再由 Web AI edit
路由和上述产品路由共同使用。

`accept` 必须拒绝任何没有 `gate_status=passed` 的版本。

### 9.4 模板一致性检查

模板清单随 APP 发布，不强制增加运行时接口。但 CI 必须校验：

- APP 使用的模板 ID、profile 和后端当前值一致。
- profile hash 一致。
- SimSun 和 Times New Roman 字体文件 checksum 一致。
- 固定回归简历的 Web/APP 布局差异处于允许范围。

## 10. 代码拆分建议

继续使用 TypeScript，因为 Agent Core、CLI 和 Electron 可以共用 APP 自己的生成、
模板和测量代码，也方便将结构化结果保存为后端现有 JSON 格式。

```text
src/resume/
├── types.ts
├── candidate-store.ts
├── page-budget.ts
├── candidate-ranker.ts
├── structure-builder.ts
├── source-validator.ts
├── candidate-patcher.ts
├── layout-gate.ts
└── pdf-postflight.ts

src/ports/
└── resume-renderer.ts

src/adapters/
├── playwright-resume-renderer.ts
└── electron-resume-renderer.ts

src/tools/resume/
├── get-resume-source-context.ts
├── prepare-resume-candidate.ts
├── patch-resume-candidate.ts
└── prepare-resume-save.ts

src/actions/
└── resume-save-executor.ts
```

职责边界：

- `structure-builder` 只做来源数据到标准结构的确定性转换。
- `source-validator` 只做事实、revision 和 JD 引用校验。
- `page-budget` 只计算生成前的页面内容预算。
- `candidate-ranker` 只比较候选版本并维护当前最佳快照。
- `layout-gate` 只解释浏览器原始测量并输出通过/失败原因。
- Renderer Adapter 只负责真实渲染、测量和打印。
- Tool 只校验参数、编排小型领域服务并返回结构化结果。
- Executor 只执行用户已经接受的不可变 Proposal。

CLI 阶段由 Playwright Chromium Adapter 加载 APP 模板并提供真实 DOM；Electron
阶段切换为加载同一份 APP 模板的 Electron Adapter。Agent Core 不 import
Playwright 或 Electron。

## 11. 实施顺序

### R1：存储格式、APP 模板和只读数据

- 按后端当前存储格式实现 `ResumeStructure`、layout observation 和 Proposal 类型。
- 将 Web 当前模板、字体和布局参数作为基准放入 APP。
- 独立实现 APP 的确定性模板渲染和 DOM measurement。
- 增加用户资料、JD、现有简历和稳定事实读取能力。
- 为模板/profile/font checksum 和固定样例布局增加一致性测试。

### R2：本地候选生成和 CLI 验证

- 实现 `prepare_resume_candidate`。
- 实现页面预算、事实排序和候选版本排名。
- 实现内容来源校验。
- 实现 Playwright Renderer Adapter。
- 实现一页、占用率、字体和 bullet 最后一行门槛。
- CLI 输出结构化门槛报告和可阅读预览。

### R3：自动修版

- 实现稳定 ID patch。
- 实现 `patch_resume_candidate`。
- 实现失败区域冻结、局部候选测试和最佳快照回滚。
- 在 System Prompt 中加入最多 3 轮、按失败项修版的规则。
- 增加过长、过短、中文、英文、混排和极端 bullet 的回归样例。

### R4：审批和云端互通

- 增加通用 staged variant 产品 API。
- 实现 `prepare_resume_save` 和 `ResumeSaveExecutor`。
- 接入现有接受/拒绝/自定义回答审批机制。
- 验证桌面端保存后 Web 能读取和渲染同一版本。

### R5：Electron 预览和 PDF

- 接入 Electron Renderer Adapter。
- 实现简历实时预览。
- 实现 `export_resume_pdf` 和 PDF postflight。
- 验证 Web 与 APP 模板效果一致，以及 CLI、Electron 和 PDF 的回归结果。

## 12. 验收标准

第一阶段完成时至少满足：

- APP 保存的 `structured` 能被 Web 直接读取和渲染，无需格式转换。
- APP 模板与 Web 模板的关键布局回归误差处于允许范围。
- 中文字符实际使用 SimSun，英文和数字实际使用 Times New Roman。
- 所有字体加载后才进行测量。
- DOM 页面数为 1，且无超出允许值的垂直溢出。
- 页面占用率满足当前模板清单。
- 每个 bullet 均有稳定 ID，且最后一行比例均不低于 `0.6671`。
- 缺失任何 bullet 观察值都会导致验证失败。
- 所有事实、数字、技术和 JD requirement 引用均可验证。
- 未通过门槛的候选版本不能进入保存审批。
- 未经用户接受不会产生云端写入。
- 服务端复验未通过的版本不能成为 active variant。
- App 保存后，Web 可以读取并正确渲染同一个版本。
- 导出的 PDF 只有 1 页且包含两种所需字体。

## 13. 最终决策摘要

本地 Pi Agent 只需要新增三个核心写作工具：

1. `prepare_resume_candidate`
2. `patch_resume_candidate`
3. `prepare_resume_save`

再配合现有/新增的只读数据工具即可完成简历生成。排版、测量、模板选择、字体检查、
来源校验和保存都由确定性代码承担，不让模型自行估算或直接写云端。

这里真正需要复用的不是后端 LangGraph 的实现，而是 CVAgent 已经形成的最终数据
格式、版本语义、模板样式、字体资产和质量门槛。

Web 与 APP 的互通不依赖新的共享代码包，而依赖同一个云端存储：

- APP 通过后端业务 API 保存为现有 `Resume` / `ResumeVariant`。
- Web 继续按现有方式读取和展示。
- APP 使用相同模板和字体，但生成、修版、测量与择优代码独立实现。

APP 生成器的目标不是复刻 Web 端算法，而是在保持最终格式兼容的前提下，通过页面
预算、事实优先、局部候选、真实渲染择优、最佳快照和失败区域冻结，稳定地产出质量
更高且满足硬性排版门槛的简历。
