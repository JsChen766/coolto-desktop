# Browser Shell UI Design Brief

> 状态：用户已于 2026-08-30 确认；BSF0 基线完成前仍不得修改产品 UI 代码。
> 方向选择：用户于 2026-08-30 选择视觉探针 B「Task Lens」。
> 视觉参考：[Task Lens 方向图](./assets/task-lens-direction.png)。该图只冻结视觉方向，不代表最终文案、站点内容或功能入口。
> 上级计划：[Browser Shell Formalization](./README.md)。

## 1. Feature Summary

Coolto Browser Window 将作为一个可以独立长时间使用的产品面，而不是主 App 的附属弹窗。它面向正在求职、
需要在多个站点间搜索、比较、填写、核对和接管 Agent 的用户，必须同时提供正式浏览器的熟悉感和 Agent 工作的
持续可见性。

设计目标是让用户无需返回聊天，也能判断当前页面、控制权、任务步骤、下一动作、授权边界和动作结果；同时继续
复用 Coolto 的 AgentTask、Grant、Receipt、资产、账号和安全事实源。

## 2. Primary User Action

用户最重要的动作不是“和 Browser 聊天”，而是：

> 在真实网页中浏览或接管任务，并在任意时刻明确知道 Agent 正在做什么、下一步会发生什么，以及如何暂停、
> 接管、恢复或停止。

浏览器必须先是一款可信、熟悉、可高效操作的浏览器，然后才是 Agent 的工作面。

## 3. Design Direction

### 3.1 视觉路线

- 颜色策略：`Restrained`，冷静中性色为主，一个低饱和蓝色仅用于焦点、Agent 活跃和当前选择；
- 主题：浅色与深色是同一套层级的两种模式，不把深色作为“AI 感”装饰；
- 锚点：Chrome 的浏览器习惯、Linear 的密度与边缘精度、Coolto 的现有字体与克制工作台；
- 方向图：以 B「Task Lens」为基准，保留 Chrome 式两层 chrome、网页主区和右侧任务 Inspector。

### 3.2 使用场景句

用户在桌面电脑或笔记本上持续 30–90 分钟处理求职任务，常在专注、焦虑和需要核对事实的状态下切换页面与
人机控制权；界面应稳定、安静、信息明确，不能通过夸张动画、AI 光效或隐藏状态增加判断成本。

### 3.3 对 B 方向图的修正

方向图中的以下内容不进入实现：

- 收藏、扩展、用户头像等尚无真实产品能力的 Chrome 图标；
- 示例 LinkedIn 数据、个人邮箱、姓名和虚构公司信息；
- 把固定“3/6”当成通用任务进度；步骤必须来自真实 AgentTask 投影；
- 用“已授权”绿色标签替代完整 Grant 摘要；
- 页面内高亮承担安全或授权含义。

保留的核心结构：

- 正式浏览器标签栏和地址栏；
- Agent 胶囊作为工具栏原生控件；
- Inspector 展开后与网页并列，而不是变成聊天侧栏；
- Inspector 内使用目标、当前动作、下一步、授权和最近活动的信息层级；
- 暂停、我来操作、停止保持始终可发现。

## 4. Scope

- Fidelity：production-ready；
- Breadth：完整 Browser 产品面，不只是一张新标签页；
- Interactivity：真实 Electron 组件和 WebContentsView 布局，不做静态原型替代；
- Delivery：先冻结全局设计，再按 BSF1–BSF4 实现，BSF5 完成 Windows 与 macOS 真实验收；
- Platforms：Windows 与 macOS；当前 720px 最小窗口、940px 产品基线、200% 缩放；
- Languages：中文和英文，所有动态文案允许比设计稿更长。

本 brief 覆盖：

1. 标签栏与窗口控制；
2. 地址栏与站点身份；
3. 加载、停止和失败反馈；
4. Agent 任务胶囊；
5. Agent Inspector；
6. 新标签页；
7. 页内查找、缩放和基础右键菜单；
8. 下载状态；
9. 人机接管与填写审核状态。

## 5. Layout Strategy

### 5.1 Browser Chrome

Browser Chrome 固定为两层，不新增常驻第三条 AgentBar：

```text
┌ Tab strip：favicon · title · Agent marker · close ───── window controls ┐
├ Navigation：back forward reload/stop │ site + URL │ Agent capsule │ download ┤
├ 2px non-numeric navigation progress                                      ┤
│                         WebContentsView                                    │
└────────────────────────────────────────────────────────────────────────────┘
```

- Tab strip 目标高度约 38–40px；
- Navigation row 目标高度约 44px；
- 总 chrome 高度应接近当前 84px 基线，不能因为 AI Native 增加长期页面占用；
- 地址栏可以保持 Chrome 式圆润输入形态，但只允许地址栏和短状态胶囊使用 full-pill；
- 普通按钮、Inspector section 和新标签页内容不得全部胶囊化；
- 加载进度是 2px 非数值阶段反馈，不向用户伪造百分比。

### 5.2 Tabs

- favicon 16px，缺失时使用中性 Globe/File 图标，不生成随机色字母头像；
- title 使用 13px，active tab 有明确 surface 连续性；
- Agent 正在工作的 tab 使用图标 + tooltip，颜色只作辅助；
- close 只在 active、hover 和 keyboard focus 时强调，但始终可通过键盘触达；
- 12–30 个标签时弹性收缩，不能依赖裸横向滚动条；
- 完整标题和 URL 通过 tooltip 提供。

### 5.3 Address and Site Identity

- 左侧依次为 back、forward、reload/stop；
- 地址栏失焦时强调 origin，聚焦时显示凭证脱敏后的完整 URL；
- HTTP 明确显示“不安全”，HTTPS 只表示连接加密，不显示“网站可信”；
- loading 时 reload 原位切换为 stop，避免增加按钮；
- find、zoom 和下载只在有状态时出现，不长期占据工具栏。

### 5.4 Agent Capsule

无活动任务时不显示空的 Agent 控件。有活动任务时，胶囊位于地址栏右侧：

- 图标；
- 控制权文字：“Agent 操作中”或“你正在操作”；
- 一行当前动作，宽度不足时省略并保留 tooltip；
- waiting、paused、reviewing 使用图标和文案变化；
- 点击切换 Inspector；
- 不在胶囊中放完整目标、聊天内容或多枚状态徽章。

### 5.5 Agent Inspector

Inspector 是 B 方向的核心，使用右侧 docked side panel：

- `>=1100px`：360px docked，真实缩小 WebContentsView，网页按自身响应式规则重排；
- `940–1099px`：320px docked；
- `720–939px`：使用不透明 overlay drawer，不永久把网页压到不可用宽度；
- 打开和关闭不得修改网页 DOM；
- Inspector 不使用 nested cards，使用 section、row、divider、timeline 和状态图标；
- Inspector 顶部显示任务名和关闭按钮，底部固定控制区。

信息顺序固定为：

1. 当前步骤与真实状态；
2. 当前目标；
3. 正在执行的原子动作；
4. 下一动作及其外部影响；
5. Grant 摘要和目标 origin；
6. 最近三条活动；
7. “打开完整任务”深链；
8. 暂停、我来操作/交还 Agent、停止。

Inspector 只读取现有 projection，不生成业务下一步，不建立第二份 timeline。

### 5.6 New Tab

新标签页不使用当前 64px Coolto 大标题、巨大浮动搜索胶囊或卡片网格。结构为：

- 小尺寸 Coolto Browser 身份；
- 一个主要地址/搜索入口；
- 有任务时显示一条“继续当前任务”；
- 有 waiting 项时最多显示三条紧凑行；
- 无任务时只显示一个清晰下一步；
- 邮箱连接、Agent Tasks 和完整回执使用深链，不在此复制管理界面；
- 不展示最近站点、历史、虚构统计或没有真实数据源的推荐。

## 6. Visual System

### 6.1 Surface

- 页面内容：真实站点 WebContentsView；
- Browser Chrome：从现有 `--bg/--surface` 派生的 Browser 语义 surface；
- Inspector：与 chrome 同一中性家族，但有明确明度差；
- Popover：使用单一阴影，不同时叠加装饰性边框；
- section：使用间距和 divider 建立层级，不用多层卡片。

### 6.2 Typography

- 继续使用 `Inter/system/PingFang SC/Microsoft YaHei`；
- tab、toolbar、button：12–13px；
- Inspector 正文：13px；
- Inspector section title：13–14px，600 weight；
- 任务名：15–16px，600 weight；
- 不用 11px 承载目标、下一动作或授权等关键信息；
- 不使用 serif、display font 或全大写段落。

### 6.3 Radius and Edges

- 图标按钮：6–8px；
- 普通输入和 panel：8–10px；
- 地址栏和短状态胶囊可使用 full-pill；
- Inspector 本体不使用大圆角；
- active、focus、selected、error 各有稳定表达，不临时叠加多圈边框。

### 6.4 Color

- 中性色承担 80% 以上视觉面积；
- 单一低饱和蓝色承担 active、focus 和 Agent-working；
- amber 只用于 waiting/需要用户；
- red 只用于失败、停止和危险动作；
- green 只用于已验证完成，不用于“看起来安全”；
- 任何状态必须同时具备文字或图标，不能只靠颜色。

### 6.5 Motion

- hover/focus：约 120–160ms；
- Inspector 开合：约 180–220ms ease-out；
- favicon spinner 结束后交叉淡入：约 120ms；
- 页面目标高亮：一次 300–500ms 的非循环反馈；
- 不使用 bounce、elastic、霓虹脉冲或统一入场动画；
- `prefers-reduced-motion` 下使用即时切换或短 crossfade。

## 7. Key States

| 状态 | 用户必须看到 | 主动作 |
| --- | --- | --- |
| 新标签页，无任务 | 地址/搜索、一个明确下一步 | 导航或搜索 |
| 新标签页，有任务 | 当前任务与更新时间 | 继续任务 |
| 普通浏览 | favicon、站点、URL、导航状态 | 浏览 |
| loading | spinner、stop、非数值进度 | 停止 |
| failed | 失败 URL、错误类别、重试 | 重试/回主页 |
| Agent working | 工作 tab、胶囊、当前动作 | 展开 Inspector/接管 |
| waiting | 等待原因和用户需要完成的动作 | 我来操作 |
| user takeover | “你正在操作”，Agent 已停止观察 | 交还 Agent |
| paused | 暂停原因和最近状态 | 重新观察后继续 |
| reviewing | 审核批次、剩余字段 | 接受/修改/拒绝 |
| revoked/stopped | 授权或任务已结束 | 打开完整任务 |
| downloading | 文件名、origin、进度或结果 | 查看状态 |
| permission denied | 不支持的权限类型与原因 | 关闭提示 |

状态文案必须来自真实 view model；设计稿里的步骤、进度和站点名都不能成为硬编码 fixture。

## 8. Interaction Model

- 点击 Agent 胶囊打开或关闭 Inspector；
- Inspector 打开时，宽屏缩小 WebContentsView，窄屏使用 overlay drawer；
- 点击“我来操作”后，Agent 立即停止页面观察和动作，Chrome 状态先变化再允许输入；
- 点击“交还 Agent”后，Harness 重新观察并重新校验 owner、Grant、origin 和页面状态；
- 点击“暂停”只暂停任务，不撤销 Grant；“停止”结束任务；“撤销授权”继续只在完整任务页执行；
- Agent 切换 tab 时，active tab 与 Agent target marker 分别表达，不假设二者永远相同；
- 关闭最后一个 tab 时关闭 BrowserWindow；重新打开浏览器时再创建新的主页 tab；
- 页面内高亮只表示当前目标，不能表示已授权、已成功或页面可信；
- Escape 优先关闭 find/临时 popover，其次停止加载，不得意外停止 AgentTask；
- 所有 hover-only 操作必须具有 focus-visible 和键盘等价路径。

## 9. Content Requirements

### 9.1 Browser Chrome

- “搜索或输入网址”
- “不安全”
- “停止加载”
- “重新加载”
- “在页面中查找”
- “缩放至 100%”

### 9.2 Agent Capsule and Inspector

- “Agent 操作中”
- “你正在操作”
- “等待你处理”
- “当前目标”
- “正在执行”
- “下一步”
- “授权范围”
- “最近活动”
- “打开完整任务”
- “暂停任务”
- “我来操作”
- “交还 Agent”
- “停止任务”

按钮全部使用动词 + 对象，不使用“确定”“好的”等模糊文案。

### 9.3 Failure and Permission

- 错误页说明真实失败类别，不显示内部堆栈；
- 权限提示使用“Coolto 浏览器暂不支持此站点权限”；
- 不把 OAuth/登录跳转错误描述成用户密码错误；
- 不显示内部 tool、scope、token、task ID 或绝对路径。

## 10. Accessibility and Responsive Requirements

- 所有图标按钮具有 `aria-label` 和 tooltip；
- tab strip 使用可预测的 roving focus；
- Inspector 打开后焦点进入标题/首个可操作项，关闭后返回 Agent 胶囊；
- overlay drawer 需要正确的焦点范围和 Escape 关闭，但不冒充必须阻塞网页的 modal；
- body text 与 placeholder 达到 WCAG AA 对比度；
- 200% 缩放下不丢失暂停、接管、停止和关闭 Inspector；
- 720px 窗口下保留地址栏、当前控制权和一个主要控制，其余进入 overflow；
- 动态状态通过 `aria-live` 克制播报，不重复播报每次 polling 更新；
- 深浅主题使用相同语义层级，不单独维护两套组件样式。

## 11. Implementation References

进入实现时优先使用以下设计检查：

- `layout`：两层 chrome、Inspector 与 WebContentsView 布局；
- `typeset`：13px 密度下的层级与中英文长度；
- `clarify`：任务、授权、失败和权限文案；
- `animate`：Inspector、加载和目标高亮；
- `adapt`：720/940/1180px 与 200% 缩放；
- `harden`：错误、离线、权限、跨账号和监听器清理；
- `polish`：真实 Electron 最终视觉收口。

实现继续遵守 Vue 3 `<script setup lang="ts">`、typed props/emits、聚焦 composable、250 行硬门禁和
`tokens.css`/Lucide 复用规则。

## 12. Confirmation Record

用户已于 2026-08-30 明确回复“确认 UI Brief”，本 brief 成为 BSF 的正式设计基准。后续变更必须重新写回并在
影响布局、控制权或安全边界时再次获得用户确认。

确认后仍按以下顺序执行：

1. BSF0 建立 Browser Shell Electron 基线 QA；
2. 完成当前浅色/深色、720/940px、200% 截图与可访问性树；
3. 冻结基线新发现的最后标签关闭语义；
4. 仅在 BSF0 完成后进入 BSF1；
5. 不在同一轮直接越过 BSF0 修改产品 UI。

用户于 2026-08-30 确认最后标签采用 Chrome 语义：关闭最后一个 tab 即关闭 BrowserWindow。至此 BSF0 的
产品决策全部冻结。
