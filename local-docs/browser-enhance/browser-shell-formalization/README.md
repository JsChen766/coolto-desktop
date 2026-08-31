# Browser Shell AI Native 与正式浏览器体验子路线

> 状态：BSF0–BSF4 已完成并通过独立质检闭环；BSF5 Windows 已启动，剩余 NVDA、真实登录接管与完整任务 deep-link 门禁。
> 讨论来源：[Browser Shell Chrome formalization 聊天记录](../browser-shell-chrome-formalization-notes.md)。
> UI 方案：[Browser Shell UI Design Brief](./ui-design-brief.md)，用户已于 2026-08-30 确认。
> 上级执行入口：[Browser Enhance README](../README.md)。本文件是下级实施计划，不替代上级路线的阶段状态。
> 正式执行位置：BE5 后先执行 BSF0–BSF4 与 BSF5 Windows 门禁，再执行 BE6，并在同一 macOS 窗口完成 BSF5 macOS 收口；之后进入 BE7。
> 建立日期：2026-08-30。

## 1. 路线定位

本路线解决的不是 Agent 缺少浏览器控制能力，而是两类已经影响产品可信度的问题：

1. Browser Shell 缺少正式浏览器应有的导航反馈、站点身份、标签管理、键盘效率、错误恢复和下载反馈；
2. AgentTask、DelegationGrant、页面观察、动作和回执已经存在，但在浏览器窗口中的表达过薄，用户不能持续看见
   “谁在控制、当前步骤、下一动作、授权边界和动作结果”。

目标不是复制 Chrome，也不是把主 App 的聊天和任务中心搬进浏览器。Chrome 只作为标准浏览器习惯的基准；
Coolto 的差异化目标是把浏览器变成一个安静、精确、有证据、可随时接管的求职任务工作面。

本路线使用 `BSF0–BSF5` 编号。`BSF` 只表示 Browser Shell Formalization 子路线，不是新的 BE 阶段，
也不复用历史 Browser Autofill 路线的 B1–B5 编号。

## 2. 与主路线的关系

建议顺序如下：

```text
BE5 手动确认基线完成
→ BSF0 方案冻结
→ BSF1 导航、身份与失败反馈
→ BSF2 标签与浏览效率
→ BSF3 Agent 可见层与人机接管
→ BSF4 新标签页与下载反馈
→ BSF5 Windows 门禁
→ BE6 macOS Calendar
→ BSF5 macOS 收口
→ BE7 AI Native Loops
→ BE8 真实生产验收
```

采用这个位置的理由：

- BSF 与 EventKit 没有实现依赖，可先在 Windows 完成产品面和 Windows 门禁；
- BE6 仍在 BE7 前执行，避免 Calendar-aware Interview Agent 缺失系统 Calendar 基础；
- macOS 执行 BE6 后紧接 BSF5 macOS 收口，复用同一真实平台窗口完成交通灯、快捷键和 BrowserWindow 验收；
- BE7 会增加 Scout、Follow-up、Briefing、Strategy Learner 和风险提醒，实施前需要稳定的 Agent 可见层；
- BE8 应验收最终用户实际使用的浏览器外壳，而不是在 BE8 中临时补基础交互。

用户已于 2026-08-30 明确要求启动本路线，上级 Browser Enhance README 和 P0 主 README 已同步为 BSF0 当前。
任何 BSF 实质进展、失败和遗留仍写回上级 Browser Enhance README；本文件保存子路线的细化门槛和逐项状态。
除非用户明确允许，各阶段均不 commit、不 push。

### 2.1 独立产品面边界

这里的“独立”指 Browser Window 是一个可单独长时间使用、拥有完整状态与反馈、能够独立通过产品验收的工作面：

- 独立窗口与窗口生命周期，不依赖主 App 当前正显示哪个页面；
- 独立的信息架构，包括标签、导航、站点身份、任务胶囊、Inspector、新标签页、错误与下载状态；
- 独立的浏览器交互密度、键盘模型、窗口适配和真实 Electron 验收；
- 独立呈现 Agent 的观察、动作、等待和接管，但不把用户送回聊天才能理解当前发生了什么。

这里的“仍属于 Coolto”指它必须共享：

- 同一个账号、主题基础、字体、Lucide 图标和 i18n；
- 同一个 AgentTask、DelegationGrant、Event、Receipt、Application 和资产事实源；
- 同一个 Site Policy、current tab/origin gate、审批、脱敏、账号隔离和本地加密边界；
- 同一套 `npm run check`、行数、真实 Electron 和发布质量门禁。

因此本路线允许建立 Browser 专用语义 token、组件和 QA，但禁止建立第二套全局主题、Agent runtime、任务数据库、
业务状态或设置中心。独立体验来自清晰的窗口职责和完整的交互反馈，不来自复制现有产品能力。

## 3. 产品目标与完成定义

### 3.1 产品目标

用户进入 Coolto 浏览器后，应在三秒内判断：

1. 当前标签是什么站点，页面是否仍在加载或已经失败；
2. 当前由用户还是 Agent 控制；
3. Agent 正在完成什么目标，处于哪个步骤；
4. 下一动作是否会读取、填写、提交、下载或离开当前站点；
5. 如何暂停、接管、恢复、停止或查看完整证据。

### 3.2 完成定义

本路线只有同时满足以下条件才可标记完成：

- Browser Shell 具备本路线冻结的导航、标签、查找、缩放、快捷键、错误页和下载反馈；
- Agent 的控制权、当前步骤、目标标签、授权摘要、等待原因和最近动作在浏览器内可见；
- 所有可信控制状态由隔离的 Browser Chrome 表达，网页内高亮不承担授权或安全身份；
- 不复制 AgentTask、Grant、Receipt、Download 或浏览器状态的事实源；
- 深浅主题、键盘、200% 缩放、720px 当前最小窗口和 12 个以上标签通过真实 Electron 验收；
- Windows 与 macOS 的平台快捷键分别在真实平台验证；缺少任一平台证据时必须记录为未完成；
- `npm run check`、Browser Agent QA 和新增 Browser Shell Electron QA 全部通过；
- BE8 前仍不宣称所有站点、权限请求或生产自动投递已经可用。

## 4. 范围与非目标

### 4.1 本路线范围

- favicon、导航阶段反馈、reload/stop、站点身份、失败页和主题化新标签页；
- 标签收缩、溢出、完整标题提示、中键关闭和标准浏览器快捷键；
- 页内查找、per-tab 缩放、基础原生右键菜单；
- Agent 任务胶囊、可展开 Inspector、工作标签指示、等待/接管/撤销状态；
- Agent 动作前的短暂目标高亮，以及填写审核 Overlay 的视觉统一；
- 下载进度、完成、失败和取消的脱敏 UI；
- 对上述能力的单测、Electron 自动化和真实人工验收。

### 4.2 明确非目标

- 不新增第二套 Agent loop、任务 runtime、消息协议、Grant、Receipt 或长期存储；
- 不把 Browser Shell 改造成第二个聊天窗口或完整 Agent Tasks 页面；
- 不新增历史记录、书签、密码管理、扩展系统、跨设备同步或通用下载管理器；
- 不实现标签拖拽、固定标签、关闭标签恢复或跨重启会话恢复；
- 不实现没有真实工具链的“问 Agent”右键假入口；
- 不让网页取得 Browser Shell IPC、AgentTask 原始事件、绝对文件路径、Cookie、Token 或凭证；
- 不借本路线扩大 Site Policy、自动提交、邮件发送或浏览器权限范围；
- 不定制外部网页滚动条，不用页面样式冒充可信 Browser Chrome。

## 5. 现有能力复用矩阵

| 需求 | 唯一事实源或现有能力 | 本路线允许的增量 | 禁止新增 |
| --- | --- | --- | --- |
| 标签与导航 | `BrowserTab`、`BrowserTabManager` | 导航阶段、favicon、失败、zoom/find 的薄状态 | 第二套 tab store |
| Browser Window 生命周期 | `BrowserWindowManager`、`browser-window-factory.ts` | 快捷键路由、窗口标题和布局适配 | 新 Browser runtime |
| Shell 通信 | `BrowserShellState`、`BrowserShellApi`、现有 preload/IPC | 最小 typed command 与脱敏 view state | 任意字符串 IPC、网页可见桥接 |
| Agent 控制 | `AgentTask`、`DelegationGrant`、`BrowserAgentStatusBridge` | 从既有状态派生浏览器摘要 | 第二份任务状态或时间线 |
| Agent 动作与审核 | `BrowserPageOperator`、Overlay、Site Policy | 可信 chrome 状态和瞬时目标反馈 | 宿主业务步骤、隐藏自动点击 |
| 下载 | `BrowserDownloadTracker` | 增加只读 observer 和脱敏 UI projection | 第二个下载监听器或绝对路径暴露 |
| 主题与视觉 | `tokens.css`、Lucide、现有字体/i18n | Browser Shell 专用语义 token 与组件 | 第二套主题、图标库或品牌色 |
| 业务结果 | Application、Tracker、Receipt 的现有 projection | 深链接和摘要 | 在 Browser Shell 复制业务事实 |

## 6. 目标信息架构

```text
┌ 标签栏：favicon · 标题 · Agent 工作标记 · 关闭 ─────────── 窗口控制 ┐
├ 导航：后退 / 前进 / reload-stop │ 站点信息 + 地址 │ 任务胶囊 │ 下载 ┤
├ 非数值导航阶段反馈 ────────────────────────────────────────┤
│                                                           │
│                        真实网页                           │
│                    瞬时 Agent 目标高亮                     │
│                                                           │
└───────────────────────────────────────────────────────────┘
                                             ┌ 可展开 Inspector ┐
                                             │ 当前目标          │
                                             │ 当前步骤/动作     │
                                             │ 下一动作与影响    │
                                             │ 授权摘要          │
                                             │ 最近三条动作      │
                                             │ 打开完整任务      │
                                             └──────────────────┘
```

约束：

- 空闲时不保留第三条常驻 Agent 工具栏；任务胶囊承载控制权和当前状态，Inspector 按需展开；
- Inspector 是现有 AgentTask/Grant/Receipt 的只读投影，操作仍调用现有 pause/takeover/resume/stop；
- 网页始终是主要工作面；Inspector 不默认永久占用页面宽度，不改变站点布局作为安全判断依据；
- 新标签页保持轻量，只提供搜索/地址入口、继续当前任务和少量待处理项，不做统计卡片仪表盘；
- 邮箱连接、任务详情和完整回执分别深链到设置、Agent Tasks 和 Tracker，不在新标签页复制管理界面。

## 7. 状态模型

Browser Chrome 至少覆盖以下组合状态；状态不得只靠颜色表达：

| 页面状态 | 控制状态 | 浏览器必须表达 | 主要动作 |
| --- | --- | --- | --- |
| 新标签页 | 无任务 | 地址/搜索入口、可选继续任务 | 搜索、打开任务 |
| loading | 用户 | favicon 位置 spinner、reload 变 stop、导航反馈 | 停止加载 |
| ready | 用户 | 站点信息、标题、favicon | 正常浏览 |
| failed | 用户 | 错误原因、失败 URL、重试和回主页 | 重试 |
| ready/loading | Agent | Agent 工作标签、目标、步骤、授权摘要 | 暂停、接管、停止 |
| waiting | 用户待处理 | 等待原因、可信 chrome 提示 | 接管并完成登录/验证码 |
| paused | 用户 | Agent 已停止观察和动作 | 重新观察后交还 Agent |
| reviewing | 用户 | 当前审核批次和剩余字段 | 接受、修改、拒绝 |
| revoked/stopped | 用户 | 授权已撤销或任务已停止 | 打开完整任务 |
| downloading | 任意 | 文件名、来源站点、进度和取消/失败 | 查看状态 |

Agent 恢复前必须继续遵守既有规则：重新观察页面，重新校验 owner、Grant、origin 和页面状态，绝不复用接管前
的 action token。

## 8. 合同与安全约束

### 8.1 BrowserTabState 最小扩展方向

实现时只允许加入 Shell 真正需要的脱敏字段，建议包括：

- `faviconUrl` 或等价的已校验 favicon projection；
- `loadPhase`，使用 `idle/starting/committed/dom-ready/complete/failed` 等离散阶段，不向用户伪造百分比；
- `failure`，只包含可见 URL、Chromium 错误码和本地化类别；
- `zoomFactor`；
- `isAgentTarget`，只表示当前任务正在操作哪个 tab，不代表站点可信。

不得把 DOM、AX、截图、表单值、Grant 原文、动作 token 或绝对路径放进 `BrowserShellState`。

### 8.2 Agent Control projection

`BrowserAgentStatusBridge` 继续是 Shell 的单一桥接点，但数据必须从既有 AgentTask、Grant、Event 和 Receipt 派生。
允许的 UI 字段包括：

- 短目标、真实 task phase、Agent/用户控制权；
- 当前原子动作、动作影响、目标 origin 和公开 Browser tab identity；
- Grant 模式与风险摘要，不暴露内部 capability 或敏感 scope 参数；
- 最近三条已脱敏活动摘要；
- 等待原因和最近更新时间。

`taskId/runId/grantId/toolCallId/token/hash` 不进入 Browser Renderer；主进程只在 bridge 内保留当前 task identity，
用于已有 command handler 和“打开完整任务”深链。Inspector 不持久化这些字段，也不自行推导业务下一步；当前没有
真实 future-action contract，因此 running 状态只展示当前阶段和正在执行的原子动作，不伪造“下一步”。

### 8.3 站点身份

- HTTPS 只表示连接加密，不使用“锁 = 网站可信”的文案；
- 使用站点信息图标展示 origin，HTTP 明确显示“不安全”；
- 聚焦地址栏时显示经过凭证脱敏的完整 URL，突出真实 origin 和异常端口，不得把不同 origin 伪装成同一站点；
- 可信 Agent 状态始终位于隔离的 Browser Chrome，网页高亮不能表示授权、成功或安全。

### 8.4 权限请求

当前代码尚未建立显式 permission handler。首版必须在浏览器 session 安装针对摄像头、麦克风、定位和通知的
显式 default-deny handler，并验证不会破坏既有 OAuth/登录跳转。Browser Chrome 只显示“Coolto 浏览器暂不支持
此站点权限”的可解释提示，不提供授予入口。任何权限开放必须另行完成威胁模型、最小权限合同和用户确认，
不能作为本路线的顺手扩展。

## 9. Vue 与模块职责图

以下名称是建议职责边界，可按现有命名微调，但不得合并成万能组件：

| 单元 | 单一职责 | 输入 | 输出 |
| --- | --- | --- | --- |
| `BrowserShell.vue` | 组合标签、导航、任务胶囊与浮层 | `BrowserShellState` | typed shell commands |
| `BrowserTabStrip.vue` | 标签集合、溢出和键盘 roving focus | tabs、active id | select/create/close |
| `BrowserTabItem.vue` | 单个标签的 favicon、标题、状态和关闭 | 单个 tab | select/close/middle-close |
| `BrowserAddressBar.vue` | 地址编辑、站点信息、reload-stop | active tab、draft URL | navigate/reload/stop |
| `BrowserNavigationProgress.vue` | 离散阶段到非数值动画的映射 | load phase | 无 |
| `BrowserFindBar.vue` | 页内查找输入和匹配导航 | find state | query/next/previous/close |
| `BrowserAgentCapsule.vue` | 紧凑显示控制权、目标和当前步骤 | agent projection | toggle Inspector |
| `BrowserAgentInspector.vue` | 只读展示授权摘要、当前动作和最近活动 | agent projection | open-task/control commands |
| `BrowserDownloadPopover.vue` | 脱敏下载列表与进度 | download projections | dismiss |
| `useBrowserShellState.ts` | 订阅和替换外部 Shell 快照 | BrowserShell API | readonly refs/computed |
| `useBrowserShortcuts.ts` | Shell 聚焦时的键盘映射 | platform、shell state | typed commands |
| `useBrowserFind.ts` | 查找条本地输入与 IPC 生命周期 | active tab | find commands/state |

Vue 组件继续使用 Vue 3 `<script setup lang="ts">`。状态源保持最小，派生状态使用 `computed`，副作用放在 composable；
props 向下、事件向上。`BrowserShell.vue` 只做组合，不承载 find、download、shortcut 或 Agent 详情逻辑。

主进程建议保持以下职责：

- `BrowserTab`：单 tab 导航事件、favicon、find、zoom、stop 和失败状态；
- `BrowserTabManager`：集合、激活、关闭语义、快捷键目标和布局；
- 新的聚焦小模块：快捷键路由、站点身份投影、原生菜单或失败页构造；
- `BrowserWindowManager`：继续只编排，不接收 UI 细节或 Agent 业务阶段；
- `BrowserDownloadTracker`：扩展只读订阅，不再注册第二个 `will-download` listener。

## 10. 分阶段实施计划

### BSF0：方案冻结与基线

目标：在改代码前冻结交互、状态合同、执行位置和真实验收样例。

工作项：

1. 复核 BE5 本地提交后的工作树，确认只剩 Browser Shell 规划与无关未提交项；
2. 将本路线正式插入 BE5 与 BE6 之间，并同步两份上级 README；
3. 确认新标签页形态、任务胶囊/Inspector、权限默认拒绝提示和最后 tab 关闭语义；
4. 冻结状态矩阵、组件职责图和 shared contract 草案；
5. 建立 Browser Shell Electron QA 入口，先记录当前基线截图和可访问性树；
6. 确认 Windows 与 macOS 的真实验收设备和不能完成时的停止规则。

完成门槛：

- 上级两份 README 已同步正式顺序；
- 用户明确确认四项产品取舍，不以“未反对”代替确认；
- QA 能启动真实 BrowserWindow，捕获浅色、深色、720px、940px、200% 基线；
- 尚未修改用户可见功能。

**2026-08-30 BSF0 设计进展：**

- 用户确认 Chrome × Linear、工具栏任务胶囊 + 按需 Inspector、完整 Browser 产品面三项推荐方向；
- 三张视觉探针中，用户选择 B「Task Lens」，理由是整体更接近正式 Chrome 浏览器；
- 已将 B 方向图保存到本路线 `assets/task-lens-direction.png`，并形成
  [Browser Shell UI Design Brief](./ui-design-brief.md)；
- 用户已明确确认 brief；新增 `npm run qa:browser-shell`，使用隔离 userData 启动真实 Electron BrowserWindow，
  不读取或污染真实 `persist:browser` 登录态；
- Windows/Electron 43.2.0 基线 8/8 通过，产物位于
  `local-builds/functional-qa/bsf0-browser-shell-5hGKpF/`：浅色、深色、Agent 运行、940px、720px、
  720px/200%、主页浅/深主题、最后标签关闭和 AX tree 均已采集；
- `desktopCapturer` 的 BrowserWindow 截图不合成 `WebContentsView` 内容，因此窗口 Chrome 与活跃页面分别
  取证。活跃页面首次 `capturePage()` 返回 `UnknownVizError`，QA 改为明确记录的 CDP
  `Page.captureScreenshot` 降级；后续一次原生 capture 成功也保留真实 capture mode，不把两者伪装为同一证据；
- 基线确认：无 Agent 时 chrome 高 86px，AgentBar 出现后为 124px；Agent message 为 11px；720px 时消息
  被隐藏；200% 时 shell 的 CSS viewport 仅 361px，虽无水平 overflow，但 chrome 占据大部分首屏；
- 新标签页在浅色和深色 shell 下均为 `color-scheme: light`、背景 `rgb(251,251,250)`；搜索容器为
  `999px` 圆角，并同时使用边框和 `0 18px 50px` 阴影，视觉上与 Browser Chrome 脱节；
- 关闭最后一个 tab 后 BrowserWindow 不关闭也不创建新标签，而是留下 0 tab 的空白窗口。建议采用 Chrome
  语义“关闭最后标签即关闭 BrowserWindow”；用户已于 2026-08-30 明确确认；
- 最新完整 `npm run check` 全绿：863 个源文件全部不超过 250 行，761 tests 为 759 pass、2 platform skip、
  0 fail；Node/Preload/Vue typecheck、Node build 和 Electron production build 均通过；
- 尚未修改任何 Browser Shell 产品 UI；
- 工作树另有与本路线无关的 Markdown 渲染改动，本阶段未读取其实现、未修改、未暂存。

**BSF0 完成结论：**UI Brief、视觉方向 B、独立产品面边界、Windows 基线、跨平台停止规则、权限默认拒绝和
最后标签关闭语义均已明确；Browser Shell QA、完整 `npm run check` 与文档写回通过。BSF0 未修改产品 UI，
现进入 BSF1。

### BSF1：导航、身份与失败反馈

目标：让浏览器在最基础的加载、成功和失败路径上具有连续且可信的反馈。

工作项：

1. 监听 `page-favicon-updated`，只保留当前 tab 的已校验 projection；无图标时使用中性的 Globe/File 图标，
   不使用随机色字母头像；
2. 用真实导航事件派生离散 `loadPhase`，Renderer 只做非数值、单调前进的视觉动画；
3. 加入 `stop()` typed command，loading 时 reload 切换为 stop；
4. 建立本地化失败状态，过滤用户主动中止和非主 frame 错误；显示错误码、人话说明、失败 URL、重试和回主页；
5. 地址栏增加站点信息，HTTP 明确提示不安全，HTTPS 不承诺网站可信；
6. 在 `browser-session.ts` 增加显式 permission request/check 默认拒绝，并向 Shell 投影脱敏的拒绝提示；
7. 修正新标签页的主题、i18n、标题和过时只读注释。

主要文件：

- `src/desktop/main/browser/browser-tab.ts`
- `browser-home-page.ts` 或其最小替代模块
- `browser-ipc-channels.ts`、`browser-ipc.ts`
- `src/desktop/shared/types/browser.ts`
- `src/desktop/browser-shell-preload/index.ts`
- Browser Shell 的 AddressBar、TabItem、Progress 组件和 i18n catalog

验收：

- 正常 HTTPS、HTTP、本地域名失败、DNS 失败、断网、redirect、用户主动 stop；
- favicon 缺失/变化/恶意长 URL 不破版、不写业务日志；
- reload/stop、进度和错误状态在深浅主题及 200% 缩放下正确；
- 摄像头、麦克风、定位和通知请求全部被明确拒绝，既有 OAuth/登录跳转仍可完成；
- 页面不能发送 Shell IPC 或伪造可信状态。

### BSF1 完成记录（2026-08-30）

- `BrowserTabState` 增加 favicon、离散 load phase 和脱敏 failure；主进程按 main-frame 导航事件维护真实状态，
  Browser Shell 展示 favicon、HTTP“不安全”、HTTPS 中性站点信息、2px 非数值进度和 reload/stop 原位切换；
- 新标签页改为主题化、双语、无大阴影的基础页；浅色/深色 body 与 shell 同步，搜索容器从 `999px + 50px`
  阴影改为 12px 单边框。任务 continuation 仍按计划留给 BSF4；
- 主 frame 导航失败进入本地化内部错误页，保留脱敏 URL、Chromium 错误码和真实重试/新标签链接；连接拒绝、
  NXDOMAIN 与 CDP offline 均真实命中对应失败状态；
- `persist:browser` session 对摄像头、麦克风、位置和通知显式 default-deny，Shell 使用地址栏内紧凑提示解释，
  720px 时收敛为可访问图标且不产生横向 overflow；未增加授权入口；
- 用户确认并实现 Chrome 语义：关闭最后一个 tab 即关闭 BrowserWindow；
- 生产 screenshot 保持 CAPTCHA 先行阻断和 password/OTP CSS 遮罩，采集从不稳定 Viz `capturePage()` 改为
  有界 CDP `Page.captureScreenshot`，Browser Agent Electron QA 从 display-surface 失败恢复为 35/35；
- `BrowserWindowManager` 将窗口生命周期拆到 `BrowserWindowHost`、权限状态拆到独立 bridge、主题/locale 拆到
  presentation，主文件从超限 281 行降至 223 行；所有新增源文件均低于 250 行；
- 最终 `npm run qa:browser-shell` 19/19，覆盖 light/dark、720/940px、200%、favicon、真实 HTTPS、HTTP、
  redirect、loading/stop、connection-refused、NXDOMAIN、offline、permission 和最后 tab；产物位于
  `local-builds/functional-qa/bsf1-browser-shell-wPAtWF/`；
- `npm run qa:browser-agent` 35/35；静态 Browser Shell detector 为 0 项；完整 `npm run check` 全绿：876 个
  源文件全部不超过 250 行，765 tests 为 763 pass、2 platform skip、0 fail，Node/Preload/Vue typecheck、
  Node build 与 Electron production build 均通过；
- AgentBar 仍为第三行、关键 message 仍为 11px，这是已冻结的 BSF3 范围；tab keyboard/overflow、find、zoom、
  native context menu 属于 BSF2；任务化新标签页和下载 UI 属于 BSF4；macOS 真实验收属于 BSF5；
- 本阶段未修改或暂存工作树中的无关 Markdown 渲染改动，未 commit、未 push。

### BSF2：标签与浏览效率

目标：达到用户接管时可依赖的标准浏览器操作下限。

工作项：

1. 拆分 `BrowserTabItem.vue`，实现 favicon、hover/focus 关闭、完整标题与 URL tooltip、中键关闭；
2. 标签按可用宽度弹性收缩，溢出使用滚动按钮或渐隐提示，但保留键盘可达路径；
3. 实现 Windows/macOS 标准快捷键：地址栏、新建/关闭/切换/定位标签、刷新/停止、前进后退、查找和缩放；
4. 快捷键在 Shell 与页面聚焦时走同一主进程路由，不依赖 Renderer 恰好获得焦点；
5. 使用 Electron `findInPage` 实现查找、计数、上下一个和 Esc 关闭；
6. 实现 per-tab zoom，非 100% 时显示可恢复徽章；首版不按 origin 持久化；
7. 使用 Electron 原生菜单提供后退、前进、刷新、复制、复制链接、在新标签打开等基础动作；
8. 关闭最后一个 tab 默认关闭 Browser Window，实施前在 BSF0 获得明确确认。

验收：

- 1、2、12、30 个标签的激活、关闭、溢出和标题可辨认；
- 纯键盘完成开、新建、切换、查找、缩放、停止和关闭；
- 中文 IME、站点输入框和常见网页快捷键不出现重复触发；
- 查找和 zoom 状态严格按 tab 隔离；切换 tab 不串状态；
- 不改变外部网页滚动条或表单控件样式。

**2026-08-30 BSF2 进展：**

- 完成三路只读审计，冻结唯一实现边界：Renderer 标签组件不新增 IPC；快捷键统一由主进程同时接管 Shell 与
  页面 webContents；find/zoom 按 tab 保存；native context menu 不注入页面脚本；
- `BrowserTabStrip.vue` 拆出 `BrowserTabItem.vue` 与 `useTabStripOverflow.ts`，实现 tablist/tab 语义、唯一
  roving tabindex、方向键/Home/End/Delete、中键关闭、关闭后邻接焦点、72px 最小宽度、固定新建/滚动按钮、
  active/focus 自动滚入可见、favicon 错误恢复和 reduced-motion；
- 新增纯 `browser-shortcut-policy`、`browser-zoom`、`browser-context-menu-policy`，覆盖 Windows/macOS 分类、
  IME/keyUp/repeat/多余修饰键拒绝、Escape 优先级、25%–500% zoom ladder、危险/凭证链接和密码选区拒绝；
- 阶段质检发现并修复两处逻辑问题：overflow 按钮出现后会占用 viewport，旧测量可能因此永远无法退出
  overflow；现按按钮保留宽度反推无按钮可用宽度并补纯函数回归。tab ID watch 改用稳定 signature，避免
  loading 等高频 Shell 快照替换时重复触发 nextTick/滚动测量；
- 核对 Electron 43.2.0 `ContextMenuParams` 后确认密码字段的真实合同就是
  `formControlType: "input-password"`，现有纯策略命名正确，不做基于错误前提的改动；
- 主进程现以同一个 `BrowserShortcutRouter` 接管 Shell 与每个页面 webContents；Window Host 负责地址栏/find 聚焦与
  页面焦点归还，Tab 层委托 `findInPage`、saved per-tab zoom 和 native context menu；显式 dispose 与 webContents
  destruction 均有可重入清理路径，Renderer 没有页面级全局快捷键，也没有给外部页面增加 preload；
- find 的“更新查询”与“上一项/下一项”使用独立 IPC，不按字符串相等猜意图；requestId 拒绝过期结果，导航/关闭/销毁
  时清理。zoom 使用 25%–500% 固定梯度，只保存 tab factor，且仅在
  tab 激活和当前 tab 导航后重施。Electron 43.2.0 没有 isolated zoom mode，因此专项 QA 使用两个**同源**页面，并同时
  读取 saved state 与真实 `webContents.getZoomFactor()`，没有用不同 origin 冒充隔离；
- Shell 增加可重复聚焦的 find bar 与非 100% zoom badge；Shell 与主窗口 Browser IPC 均校验真实 sender 和运行时
  payload。页面导航、`window.open`、Shell 与主窗口入口统一只允许无凭证 HTTP(S)，每个 tab 的内部主页/错误页使用
  不可预测 token，任意 `data:` 后缀不能冒充可信 Browser Chrome；
- 右键菜单只保留已冻结的后退、前进、刷新、复制、复制链接和安全 HTTP(S)
  新标签打开；删除未确认的“搜索所选文字”，菜单动作点击时再次校验 window/tab 存活与链接安全性；
- 接入后的交叉审计与真实 Electron 压测发现并修复：overflow 控件挂载后二次压缩 viewport、同源 favicon 事件不重发、
  主进程选 tab 与 roving focus 竞争、地址栏/find 的 IME 中间态与旧 query、Find/Zoom 关闭后的焦点归还、可取消 close
  事件过早销毁 tab，以及 `data:` 内部页身份伪造与非 HTTP(S) 导航绕过；
- 本轮阶段质检继续发现并修复四处确定性问题：错误页 F5/Ctrl+R 只重载本地 data 页而不重试原 URL；Delete 未拒绝
  Shift/repeat；browser accelerator 在 handler 副作用前未先消费；跨错误页返回已知 origin 时 Chromium 不重发 favicon。
  现错误页 reload 重试失败 URL，Delete 仅接受无修饰且非 repeat 的局部 tab 动作，router 先消费再 dispatch，favicon
  按 tab/origin 缓存并在返回时恢复；
- 终审继续分离错误页展示 DTO 与私有 exact retry URL，避免 4,096 字符展示上限截断 F5/重试目标；per-tab favicon
  origin cache 使用 32 项 LRU 上限，既能恢复已知 origin，也不会随长生命周期跨站导航无界增长；
- `qa:browser-shell` 已升级为 `bsf2-v2` 精确检查集合，不再使用 `passed >= N` 弱门槛；Windows Electron 43.2.0
  全套 32/32（其中 BSF2 自动专项 13/13）：通过 page→chrome Ctrl+L、T/W/数字/Control+Tab、find 4 次匹配与方向、
  Find 输入框 Escape→页面焦点、同源双 tab find/zoom 隔离与 110% badge、唯一 roving tabstop、完整 title+URL tooltip、
  1/2/12/30 tabs、首/中/末 tab、Arrow/End、940/720px 与 Shell 200%；新增真实 Windows Ctrl+R/F5 错误重试、
  loading Escape stop、Alt+Left/Right、Ctrl+A/C/V/Z 页面保留、Delete 的 Shift/repeat 拒绝及中键关闭，产物位于
  `local-builds/functional-qa/bsf2-browser-shell-jiH8ad/`；Browser Agent 回归 35/35；
- 相关 focused tests 35/35；最终 `npm run check` 全绿：898 个源文件均不超过 250 行，796 tests 中 794 pass、
  2 个平台 skip、0 fail，Node/Preload/Vue typecheck、Node build 与 Electron production build 均通过；
- 新增 `npm run qa:browser-shell:manual`，固定打开本地 fixture 供 Windows native menu 与 Microsoft 拼音候选窗验收。
  本轮已启动真实可见 Electron 窗口，但 Computer Use 原生管道在一次重试和会话重置后仍不可用，因此没有将菜单弹出、
  菜单选择或真实 TSF composition 写成通过；
- **2026-08-30 阶段迁移决策：**用户明确要求暂缓真实人工验收并继续下阶段。Windows native menu 与真实中文 IME
  两项以“未验收”状态移交 BSF5 Windows，不记为通过；BSF2 以实现、合同和 Windows Electron 自动化收口进入 BSF3。
  macOS Cmd、交通灯、native menu 与窗口行为继续 carry 到 BSF5 macOS，不得用 Windows 合同测试冒充；
- 本批未 commit、未 push；工作树中的 `.gitignore` 与 Markdown 渲染改动继续保持无关且未触碰。

### BSF3：Agent 可见层与人机接管

目标：把既有 AgentTask、Grant、动作和控制权变成浏览器内持续可见的可信状态。

工作项：

1. 将现有 `BrowserAgentBar` 收敛为任务胶囊，空闲时不占据第三条常驻工具栏；
2. 从既有 AgentTask/Grant/Event/Receipt 派生当前步骤、原子动作、目标 origin、授权摘要、等待原因和最近三条活动；
3. 增加只读 Inspector，支持打开完整 Agent Tasks、暂停、接管、重新观察后恢复和停止；
4. Agent 当前工作的 tab 增加图标和文字可解释的状态，不只使用颜色或描边；
5. waiting、paused、revoked、stopped、reviewing 使用稳定的 chrome 状态和明确下一步；
6. Agent 点击或写入前可短暂高亮目标元素，高亮只表达“当前目标”，不表达授权、成功或安全；
7. 填写 Overlay 改用与 Browser Shell 一致的字体、语义 token、focus 和 reduced-motion 规则；
8. 页面高亮失败、页面重绘或跨域 frame 不得阻塞 Agent 的真实结果，也不得降级为隐藏坐标点击。

验收：

- read-only、托管写入、用户接管、验证码等待、暂停、恢复、撤销和停止逐态验证；
- Agent 切换三组标签时，工作指示与 active tab/target tab 不串用；
- 接管后 Agent 不再观察和动作；恢复前重新校验 owner、Grant、origin 和页面状态；
- 网页伪造相似徽章不能改变真实 Browser Chrome 状态；
- Inspector 不产生第二份任务状态、活动时间线或业务下一步。

**2026-08-30 BSF3 第一批实现与阶段质检：**

- 在写可见层前先复现并修复三项接管安全边界：fresh observation 现在绑定 `runId`；ActionToken consume
  必须仍匹配 task 当前 active run；task 进入 waiting/completed/failed/paused/canceled/revoked 时统一撤销 Browser
  write access。接管前的 observation/token 不会跨 resume 复用；
- `BrowserAgentStatusBridge` 不再接受任意 Renderer 状态，改为订阅既有 AgentTask repository invalidation，读取
  Task、DelegationGrant、Event、PolicyDecision 和 Receipt 后生成脱敏 `BrowserAgentChromeView`。旧 owner 的延迟读取、
  command 结果和 raw error 均不能覆盖新 owner；terminal projection 仅在当前 session 稳定保留，不在重启后复活；
- 当前动作复用 `ManagedTaskPolicyHooks` 的真实 allow 后/complete 事件，新增的 observer 只保存 run-scoped transient
  action context，不建立第二个 Agent loop、task store 或 timeline。只有实际通过 policy 的工具才显示 current action 和
  target tab；动作结束、takeover、换 run 或 terminal 后 marker 失效；没有真实 future-action 来源时不生成 next action；
- 旧第三行 `BrowserAgentBar` 已收敛为地址行 Capsule；只读 Inspector 使用独立可信 `WebContentsView`。1180px 为
  360px dock、940px 为 320px dock、窄于 940px 为 overlay；Shell 200% 时统一按 CSS px → DIP 换算，并同步 Inspector
  zoom。Inspector 使用独立非持久 partition、CSP、window-open/navigation/redirect deny，隐藏状态不能发送 command；
- Capsule、Inspector、Grant 摘要、最近三条活动、控制条、二次 stop 确认和 tab target marker 均只消费同一 projection。
  takeover 成功后 Inspector 自动关闭并把焦点交给页面；主动关闭返回 Capsule；projection 消失或非法 layout 时返回页面。
  Agent/background 切 tab 不再抢走 Inspector 焦点；
- “打开完整任务”不向 Browser Renderer 发送 taskId：Inspector 只发无参数命令，主进程从 bridge 取得 canonical taskId，
  聚焦主 App 并深链 Agent Tasks。重复打开同一 task 使用递增 request，仍会重新选择目标；正在运行的 Agent 不阻塞只读
  详情，但离开未保存 Experience 前继续走既有确认；
- 阶段质检发现新增 Inspector preload 后 Rollup 会抽取 sibling chunk，而 sandbox preload 无法 `require()`，首轮真实
  Electron 因此无法建立 Shell ready。已让 Inspector preload 保持单文件，并把 `desktop:build` 加入四个 sandbox
  preload 必须 standalone 的硬门禁；没有以 typecheck/build 绿掩盖运行时失败；
- Windows Electron 43.2.0 `bsf3-v1` 精确集合 36/36：原 32 项 Browser Shell 回归继续通过，新增 4 项证明 idle
  无 Capsule/Inspector、Capsule/Inspector/target marker 同源 projection、Inspector 外部导航被阻止、720px/200%
  下 close/pause/takeover/open-task/stop 无横向溢出且可达。独立 Inspector 1180/720/200% 截图与报告位于
  `local-builds/functional-qa/bsf3-browser-shell-JCg1wW/`；
- Browser Agent `bsf3-v1` 已从弱数量门槛改为 35 个 exact ordered checks，真实 Electron 路径会点击 Capsule、打开
  canonical Inspector、从 Inspector 发出 takeover，并继续完成 Browser/Webmail/Managed Apply/Download 回归，35/35；
- focused projection/coordinator/bridge/layout/IPC/Harness/Lifecycle tests 29/29；最终 `npm run check` 全绿：
  924 个源文件均不超过 250 行，814 tests 为 812 pass、2 个平台 skip、0 fail，Node/Preload/Vue typecheck、
  Node build、Electron production build 与四个 sandbox preload standalone 门禁均通过。本批未 commit、未 push，
  `.gitignore` 与 Markdown 渲染等无关用户改动未清理、未覆盖。

**2026-08-30 BSF3 第二批、安全终审与完成结论：**

- 接管/恢复安全矩阵新增真实 memory Harness 回归：late run1 snapshot 不能写入 run2 observation；pause/takeover、cancel、
  wait、complete、failed、revoke 和 app recovery 会立即关闭 Browser access、清 transient action，并把未结 ActionToken
  统一收成 uncertain/blocked receipt。旧 prompt rejection 不再把 paused/canceled 覆盖为 failed；manual resume 即使携带
  pending events 仍保持 `wakeCause=user`，scheduler 才使用 `environment_event`；
- ActionLedger 先校验 active run、expiry、origin、tab 和 observation，再允许 duplicate receipt；policy allow 使用
  `recordIfActiveRun` 原子落盘，不留下 ghost allow。navigate redirect 绑定实际 origin；new-tab/close-tab 分别按“新 id
  事前未知”与“关闭目标已消失”的语义核验；select/close preflight 从 requested tab 取 origin。安全 focused 40/40；
- `browser_list_tabs` 在主进程预检全部返回 tab：任一 HTTP(S) origin 不同时落入 DelegationGrant 与严格 Site Policy 就
  整体阻止，不向模型泄露该 tab 的标题或 URL；snapshot/query/get-active 继续绑定活跃 origin。Browser Chrome 只投影
  实际含 Browser scope 的 AgentTask；Grant revoked/expired/terminal 只保留“打开完整任务”，reviewing 不显示 takeover；
- 真实当前动作开始前复用既有 fillId 生成一次 340ms、450ms hard max 的目标高亮；fill/select/check/click/scroll 均沿用
  语义元素定位，完全离屏、元素消失、跨域 frame、CSP 样式阻止或 Renderer 销毁时不等待、不坐标降级，也不改变真实
  action result。Browser Agent Electron 新增对 marker 实际插入的检查；
- 填写审核 Overlay 改为 Chrome × Linear 中性 visual system，支持 light/dark、zh-CN/en-US、文字状态、键盘闭环、
  focus-visible、reduced-motion、forced-colors、窄宽动态高度、离屏徽章恢复和可逆焦点/padding/listener cleanup。
  决策状态运行在固定 isolated world `1001`，只接受 `event.isTrusted`；main-world 伪造 state/合成 click、DOM/文案/样式
  篡改和 `__proto__` fillId 均 fail-closed；
- 真实 Electron 质检没有隐藏失败：先发现 user-origin CSS readiness 的 DPR 1.25 取整误判，改为 visual viewport +
  最多一个物理像素容差；随后确认 Electron 43.2 Windows 的 `cssOrigin:user` removal key 会“resolve 但不清除”。A/B
  证明 `cssOrigin:author` 可应用关键 high-specificity/`!important` 样式且真实清除后，才改为 author origin，持续 computed
  tamper check 不降级。失败产物 `UC3W0w/hMllgM/iv5W6m` 保留为诊断史，不冒充通过；
- 最终 Windows Electron 43.2.0 `bsf3-v1` exact suite **48/48**：包含原 32 项回归、Capsule/Inspector/三标签
  active-target 分离、重复 projection/单 live region、网页 spoof、Inspector Escape/自动焦点、dock/overlay bounds，以及
  OVL-01～07 的 isolated spoof、synthetic/physical click、双主题双语言、离屏恢复与完整 CSS/DOM/focus cleanup。
  报告位于 `local-builds/functional-qa/bsf3-browser-shell-lfIUQR/report.json`，SHA-256
  `1F4EFB7A9D1469FB47EC53512263CDDD2EB5D81731A287761278B43503AEF61F`；
- Browser Agent `bsf3-v1` exact **36/36**，继续通过 Browser/Webmail/Managed Apply/Download，并新增真实 Capsule→Inspector
  takeover 与瞬时 target highlight；最终 `npm run check` 全绿：941 个源文件均不超过 250 行，872 tests 为
  870 pass、2 个平台 skip、0 fail，Node/Preload/Vue typecheck、Node build、Electron production build 与四个
  sandbox preload standalone 门禁均通过；
- 页面访问状态现在有 push subscription：Grant/revoke/review/active tab/origin 变化会更新 Inspector，授权 tab 关闭或
  origin 漂移会同步停止 Overlay/CAPTCHA 并清 fill log；Browser 打开入口统一携带主 App theme/locale，Shell state
  再向 Inspector 传播 locale。重复 task deep-link 使用 sequence，离开未保存 Experience 仍先确认。

**BSF3 完成结论：**实现、自动化、安全合同和 Windows Electron 自动矩阵已完成，当前正式进入 BSF4。按用户“真实人工
验收先暂缓”的决定，Windows 视觉质感/动画、NVDA 动态播报、真实登录-OTP-CAPTCHA 接管→恢复、完整任务 deep-link
人工体验，以及 BSF2 遗留的 native menu/微软拼音，全部以“未验收”状态移交 BSF5 Windows；不因本阶段自动全绿把它们
写成通过。macOS 真实快捷键、交通灯、Inspector 焦点与窗口行为继续移交 BSF5 macOS。本批未 commit、未 push，用户的
`.gitignore` 与 Markdown 渲染等无关改动未覆盖、未清理。

### BSF4：新标签页与下载反馈

目标：补齐浏览器自有画布和已有下载能力的用户反馈，但不把新标签页做成第二个仪表盘。

工作项：

1. 新标签页只保留地址/搜索和“继续当前任务”两类入口；把已有页面交给 Agent 的动作由可信 Browser Chrome
   打开主 App 对话，并附带当前 tab 的脱敏 URL/标题，不在新标签页直接启动 Agent；
2. 有活动任务时显示一条“继续当前任务”；有等待用户事项时最多显示三条紧凑行；
3. 任务详情、邮箱连接和完整回执使用深链接打开既有页面，不复制表单或管理逻辑；
4. 新标签页数据使用只读、脱敏 snapshot，不向所有外部 WebContentsView 暴露 preload API；
5. 扩展 `BrowserDownloadTracker` 的 observer，向 Shell 只投影文件名、来源 origin、字节、状态和时间；
6. 下载 UI 显示进行中、完成、取消和中断；绝不显示本地绝对路径；
7. 首版不增加历史记录、最近站点、书签或虚构的使用数据。

架构门禁：

- 优先让 Browser Chrome 承载任务入口；如果任务数据必须显示在内容区，必须使用独立可信内部页或主进程生成的
  脱敏 snapshot，不能给外部页面共享任务 preload；
- 下载 UI 必须消费现有 tracker，不得再次监听 `will-download`；
- “在文件夹中显示”等会暴露本地信息的动作必须经过宿主边界，并在产品确认前不实现。

验收：

- 无任务、运行中、等待用户三种新标签页状态；
- 深浅主题、中文/英文、离线和 App 无账号数据时均有明确下一步；
- 同名下载、取消、失败、大文件进度和多下载并发；
- Renderer、模型、日志和业务状态均不出现绝对路径。

**2026-08-31 BSF4 实现、运行时质检与完成结论：**

- 新标签页继续使用每个 tab 独立 token 的主进程生成内部页，不向外部 `WebContentsView` 注入 preload。它只读取
  既有 `BrowserAgentStatusBridge` 的脱敏 snapshot，覆盖无任务、运行中和等待用户；最多展示既有 projection
  实际提供的待处理项，不补造任务、最近站点、历史、书签或统计；“继续当前任务”只从可信内部页调用 canonical
  task deep-link，外部页面伪造同协议导航会被拒绝；
- Browser Chrome 新增“在 App 中使用此页面”入口。宿主只转交截断标题与去掉凭据、query、fragment 的 HTTP(S)
  URL，主 App 打开现有对话并预填 Composer，不在 Browser 内创建或启动第二个 AgentTask；重复交接使用递增
  sequence，App 未登录时保留请求并先展示真实登录路径；
- `BrowserDownloadTracker` 仍是唯一 `will-download` 监听器；新增的 observer 只投影文件名、来源 origin、字节、
  进行中/完成/取消/中断状态和时间。并发同名文件的内部保存名使用宿主保留集合去重，路径从未进入 Renderer、
  模型结果、日志或业务状态；“在文件夹中显示”、删除、移动、上传均未实现；
- 首轮自动 DOM 检查虽绿，真实窗口截图发现 Shell DOM popover 会被原生网页 `WebContentsView` 覆盖。没有把
  56/56 提前当成完成，而是改为独立 sandboxed `WebContentsView` 可信浮层；它使用单独非持久 partition、CSP、
  navigation/window-open deny 与严格 sender/open 校验，继续消费同一 projection，不形成第二个下载监听器或 store。
  面板按窗口和 zoom 布局，关闭/Escape/dismiss 恢复可信 trigger，网页 DOM 与 viewport 不被修改；
- Windows Electron 43.2.0 `bsf4-v1` exact suite **57/57**：保留 BSF2/BSF3 全回归，并新增无任务/运行中/等待、
  可信 task deep-link、外部页伪造拒绝、可信页面交接、深色英文离线主页、同名并发与真实进度、完成/取消/中断、
  dismiss/Escape 和绝对路径不泄露。最终报告及窗口/内部页/独立下载浮层截图位于
  `local-builds/functional-qa/bsf4-browser-shell-Ty64ku/`；
- Browser Agent Electron exact **36/36**，继续覆盖 canonical Inspector takeover、Browser/Webmail/Managed Apply
  与下载无路径结果；最终 `npm run check` 全绿：954 个源文件不超过 250 行，879 tests 为 877 pass、2 个平台 skip、
  0 fail，Node/Preload/Vue typecheck、Node build、Electron production build 与 5 个 sandbox preload standalone
  门禁均通过；
- BSF2/BSF3 移交的 Windows native menu、微软拼音、视觉/动画、NVDA、真实登录/OTP/CAPTCHA takeover→resume
  和完整任务人工 deep-link 仍是 **未验收**，继续进入 BSF5 Windows，不因 BSF4 自动矩阵通过而改写；macOS 项仍
  留给 BSF5 macOS。本批未 commit、未 push，工作树中的 Markdown 等无关用户改动未清理、未覆盖。

**BSF4 完成结论：**新标签页、可信页面交接、下载 observer/浮层、安全边界、Windows Electron 矩阵和全量门禁
均已完成，满足进入 BSF5 Windows 的自动化前置条件；当前正式执行指针改为 BSF5 Windows，人工移交项必须逐项
真实验收后才可进入 BE6。

**2026-08-31 BSF4 独立质检校正：**上述结论只成立于实现与既有自动矩阵，不再视为完整质检通过。本轮按
Accessibility / Performance / Responsive / Theming / Anti-pattern 五维复核，健康分 **15/20（Good）**，0 个 P0、
3 个 P1、3 个 P2：

- **P1 下载浮层键盘不可达：**真实 Windows OS 级键盘验证中，打开浮层后连续 8 次 Tab 只在 Shell 的标签、
  窗口控制、地址栏、页面交接和下载 trigger 间循环，`关闭下载`、`移除下载记录` 从未获得焦点。原因是独立
  `WebContentsView` 打开后没有建立可信焦点入口；现有 Escape 只能关闭，不能替代完整键盘操作；
- **P1 小字对比度未达 WCAG AA：**下载浮层的 `--muted` 小字在 light `--surface-strong` 上为 **3.52:1**，
  dark 上为 **3.45:1**；新标签页 light task time 为 **4.21:1**，均低于普通文字 4.5:1；
- **P1 projection 更新打断 Inspector 焦点：**临时真实 Electron 探针每 2.5 秒更新同一 Agent projection；
  Chromium 保留了新标签页输入值，否定“输入被清空”的初始猜测，但 `refreshHomeTask()` 的内部页 reload 会把
  实际键盘路径从 Inspector 抢回页面，随后 Tab 只在搜索框与“继续当前任务”间循环；
- **P2 精确页面身份损失：**页面交接会无条件删除全部 query/fragment；对以 query 保存 job ID 的站点可能只把
  用户带回通用列表，需要产品确认敏感参数脱敏与可用性的边界；
- **P2 Inspector 动画合同未实现：**当前只有 Capsule 的 140ms 颜色 transition，独立 Inspector host 为即时
  show/hide，没有 UI Brief 要求的 180–220ms 开合；
- **P2 矩阵缺口：**现有 57/57 没有覆盖 download popover 的 dark/en-US、720px/200% 与 Agent/permission
  组合态。安全隔离、单一 tracker、路径不泄露、状态文字/图标、reduced-motion spinner、无 AI 装饰等保持通过。

因此 BSF4 状态校正为“实现完成、质检未闭环”，P1 修复与回归通过前不得把 BSF5 Windows 标记完成，也不得进入 BE6。

### BSF5：真实 Electron 集成交付

目标：把前四批作为一个真实浏览器外壳交付，不以组件截图或单元测试代替产品验收。BSF5 分成 Windows 门禁
和 macOS 收口；Windows 门禁通过后进入 BE6，BE6 完成后立即完成 macOS 收口，二者均通过才标记 BSF5 完成。

BSF5 Windows 继承待办：

- 运行 `npm run qa:browser-shell:manual`，完成 Windows native context menu 与真实中文 IME 候选窗验收；
- 人工检查 BSF3 Inspector/Capsule/Overlay 的视觉质感、180–220ms 开合、NVDA 动态播报与 720px/200% 键盘路径；
- 使用一次真实登录、OTP 或 CAPTCHA 完成 takeover → 用户处理 → resume，并验证恢复前重新观察；
- 从 Inspector 打开完整任务，覆盖同一 task 重复 deep-link、主 App 正在运行 Agent 和未保存 Experience 离开确认。

这些项目在 BSF2/BSF3 仅被延后，未被自动化或阶段迁移视为人工通过。

**2026-08-31 BSF5 Windows 启动记录：**当前 Codex 工具清单没有可调用的 Computer Use 桌面接口，因此没有把
CDP、DOM 或 Electron `sendInputEvent` 冒充 Computer Use。本轮改用真实 Windows 前台窗口、Win32 鼠标/键盘输入、
UI Automation 和屏幕捕获开始人工矩阵，证据位于
`local-builds/functional-qa/bsf5-windows-manual-20260831/`：

- `01-manual-ready.png`、`02-browser-foreground.png` 是前台切换尚未成功时误捕的 Codex 窗口，仅作失败诊断，
  **不计验收证据**；有效 Browser 证据从 `04-browser-foreground.png` 起，并以下列逐项文件为准；

- **native context menu 通过：**OS 级右键打开真实菜单；UIA 读取 `SubmenuView/MenuItemView` 的“后退/前进/
  重新加载”，状态分别 disabled/disabled/enabled，并真实 Invoke“重新加载”后菜单关闭；截图
  `05-native-context-menu.png`；
- **微软拼音通过：**目标窗口线程 HKL 为 `0x0804`；真实键盘输入 `zhongwen` 出现微软拼音候选窗，选择 1 后
  UIA `ValuePattern` 回读“中文”；截图 `06-microsoft-pinyin-candidate.png`、
  `07-microsoft-pinyin-committed.png`；
- **视觉与 720px/200% 部分通过：**默认 Inspector 与 720px/200% overlay 的停止/暂停/接管/完整任务按钮均
  可见，截图 `10-agent-inspector-default.png`、`11-agent-inspector-720-zoom200.png`；但 projection 更新后的真实
  Tab 路径被页面夺回，不能把按钮“可见”写成键盘验收通过，且 180–220ms 动画合同失败；
- **NVDA 未验收：**本机未发现 NVDA 可执行文件，UIA 属性不能替代 NVDA 动态播报；
- **真实登录/OTP/CAPTCHA takeover→resume 与完整任务 deep-link 未执行：**需先关闭上述 P1，再使用真实产品会话
  和用户接管敏感输入；不得用 fixture 或旧登录进程冒充。

本轮没有修改产品代码、没有 commit/push；只生成被忽略的本地 QA 探针与截图。BSF5 Windows 已启动但门禁未通过。

**2026-08-31 一次性修复与复验：**用户要求一次性关闭上述审计项后，3 个 P1 与 3 个 P2 均已修复：

- 下载浮层新增独立 typed focus channel，打开/ready 后把焦点送到“关闭下载”，Escape/关闭后回到 download trigger；
  trigger 与面板使用 `aria-haspopup="dialog"`、`role="dialog"`。真实 Windows UIA 复验确认打开后关闭按钮获得焦点，
  再按 Tab 可到达 `移除下载记录：os-focus.bin`；证据 `12-inspector-focus-fixed.png`、
  `13-download-focus-fixed.png`；
- 新标签页移除内容输入框的 `autofocus`，`browserHomeTaskKey()` 只在 goal/state/waiting items 变化时刷新，
  timestamp-only projection 不再 reload。真实前台探针持续更新 3.3 秒后，Tab 仍进入 Inspector 的“关闭任务详情”；
  Chromium 同时继续保留搜索草稿；
- 新增 `--browser-secondary-text`，light/dark 在 `--surface-strong` 上分别为 5.07:1、5.38:1；新标签页更新时间
  同步使用 AA 颜色。新增自动 contrast 门禁；
- 页面交接改为保留普通 query 和非敏感 hash，只删除凭据及 token/auth/code/password/session/signature 等敏感参数；
  jobId 等精确页面身份继续保留；
- Inspector 对 docked/overlay 统一使用 200ms enter、160ms exit，Renderer 在 ready 时上报
  `prefers-reduced-motion`，reduced-motion 走即时关闭；修复退场期间快速 reopen 的竞态，close(true)/close(false)
  使用确定性的页面/trigger 焦点恢复语义；
- 下载矩阵新增 dark/en-US、720px/200%、纵向多记录滚动和英文单数 `Downloading 1 file`，无横向溢出且核心动作
  可见。

最终 Windows Electron 43.2.0 `bsf4-v2` exact suite **61/61**，报告与新增截图位于
`local-builds/functional-qa/bsf4-v2-browser-shell-qU6NwQ/`；Browser Agent **36/36**；`npm run check` 全绿：
955 个源文件不超过 250 行，883 tests 为 881 pass、2 个平台 skip、0 fail，Node/Preload/Vue typecheck、Node build、
Electron production build 与 5 个 sandbox preload standalone 门禁全部通过。Impeccable 复扫仅剩 Inter/紧凑产品字号的
通用 warning，二者均是已确认 Product register 与 UI Brief 的既有设计选择，不计缺陷。

**质检结论校正：**BSF4 的 3 个 P1 与 3 个 P2 已全部关闭，独立质检闭环恢复为通过。BSF5 Windows 不再被
BSF4 阻塞；native menu、微软拼音、视觉/动画、720px/200% 与真实 OS 键盘焦点已通过。NVDA、真实登录/OTP/CAPTCHA
takeover→resume 和真实完整任务 deep-link 仍未验收，BSF5 Windows 继续保持进行中，不能进入 BE6。

**2026-08-31 Browser 产品级视觉收口：**用户确认以 Google Chrome/Linear 为主要参考，并明确第一方 Browser UI
只使用 `#FBFBFA`、`#1B1B19`、`#8A8A86` 三个黑白灰源色及透明度层级；第三方网页与 favicon 保留原始内容颜色。
本轮在不改变 AgentTask/Grant/Receipt、下载 tracker、deep-link 与页面安全合同的前提下完成：

- 标签带、激活标签、工具栏与填充式 omnibox 改为连续表面，Chrome 只保留工具栏下方一条常驻结构线；彩色
  Agent/进度/失败/窗口关闭状态全部改为图标、文字与黑白反转表达；
- 新标签页改为上部居中的 Coolto 标识、52px 搜索入口和现有任务投影，移除彩色状态点、明显输入边框、空页
  滚动条与额外提示；等待项、更新时间和可信任务 deep-link 契约保持不变；
- Inspector 不再在任一宽度 dock 或缩窄网页。独立 `WebContentsView` 统一成为锚定右上角的 380 CSS px 悬浮工具窗，
  保留 8px 阴影缓冲且 `pageRightInset=0`；720px/200% 使用双侧 8px inset。内部 section 以 24px 间距代替连续
  分隔线，底部 pause/takeover/open/stop 固定为单行，极窄时收短为图标；
- Inspector 与下载列表直接复用 App 的 5px、默认透明、hover 显示 thumb 的 scrollbar 规则；下载列表取消逐行
  分隔线。统一 motion budget 为 80/120/180/220ms，Inspector 使用 220ms enter/160ms exit，tab 补位、按钮按压、
  下载浮层与新标签页只保留状态解释型动画，全部提供 reduced-motion 降级；
- 新增悬浮 bounds、单行操作、共享 scrollbar、三色 palette 与旧彩色值回归测试，并同步升级 exact QA 名称和
  物理像素舍入容差。Windows Electron 43.2.0 `bsf4-v2` exact suite **61/61**，33 项报告/截图位于
  `local-builds/functional-qa/bsf4-v2-browser-shell-q0LDZj/`；`npm run check` 全绿：956 个源文件均不超过 250 行，
  885 tests 为 883 pass、2 个平台 skip、0 fail，Node/Preload/Vue typecheck、Node build、Electron production build
  与 5 个 sandbox preload standalone 门禁全部通过。

本轮没有重新执行 NVDA、真实登录/OTP/CAPTCHA takeover→resume 或真实完整任务 deep-link，因此不借视觉收口
把 BSF5 Windows 标为完成；执行指针仍停在 BSF5 Windows。未 commit/push，工作树中的 Markdown auto-link 等
无关用户改动继续保留。

**2026-08-31 新建标签按钮定位校正：**修复 tab viewport 无条件占满标题栏导致 `+` 永远贴近窗口控制区的问题。
普通状态下标签保持 220px 稳定宽度，viewport 按内容收缩，`+` 紧跟最右侧标签；进入 overflow 后才保留在右侧
滚动控件与窗口按钮附近。ResizeObserver 同步投影可用 viewport 宽度，窗口缩放或 720px/200% 时重新确保当前标签
完整可见。Electron 实测中单标签 `newTabAdjacent=true`，12 标签/940px 与 30 标签/720px/200% 的 overflow、首/中/末
标签可见及键盘 roving 检查均通过；截图位于
`local-builds/functional-qa/bsf4-v2-browser-shell-uGEmr9/01-light-1180.png`、
`17-bsf2-tabs-12-940.png`、`18-bsf2-tabs-30-720-zoom-200.png`。该轮完整 Shell suite 后续被测试环境把
`.invalid` 返回为 `ERR_EMPTY_RESPONSE` 而非固定 `ERR_NAME_NOT_RESOLVED` 阻断，未把这项无关网络差异写成 61/61；
`npm run check` 仍全绿，885 tests 为 883 pass、2 个平台 skip、0 fail。

自动化门禁：

1. `npm run check:source-lines`；
2. `npm run typecheck`；
3. `npm run desktop:typecheck`；
4. Browser Shell/shared/main focused tests；
5. `npm run qa:browser-agent`；
6. 新增 `npm run qa:browser-shell`，覆盖窗口、标签、键盘、find、zoom、错误、Agent 状态和下载；
7. `npm run check`。

真实人工矩阵：

| 维度 | 场景 |
| --- | --- |
| 主题 | 浅色、深色、运行中切换 |
| 尺寸 | 1180px 默认、940px、当前 720px 最小、200% 缩放 |
| 标签 | 1、12、30 个；长标题、无 favicon、loading、failed |
| 导航 | HTTPS、HTTP、redirect、DNS 失败、断网、停止、重试 |
| 效率 | Windows/macOS 全套快捷键、find、zoom、右键菜单 |
| Agent | 只读、托管、接管、恢复、waiting、reviewing、revoked、stopped |
| 安全 | 登录、验证码、跨域 frame、页面伪造提示、权限请求默认拒绝 |
| 下载 | 并发、同名、取消、失败、完成、路径不泄露 |
| 可访问性 | 键盘、focus-visible、tooltip、文本缩放、reduced motion、非颜色状态 |

性能与稳定性：

- 标签切换和 Agent 状态更新不得造成可见 WebContentsView 抖动或地址栏输入丢失；
- 30 个空闲标签下 Shell 状态推送不得形成无界轮询或 favicon 网络重取；
- Inspector/Popover 打开与关闭不应修改页面 DOM；
- 浏览器窗口关闭、App 退出和账号切换后，所有监听器和 transient UI 必须清理；
- Windows 通过不能替代 macOS 交通灯、快捷键和真实窗口验收，反之亦然。

## 11. 延后能力

以下能力不属于 BSF0–BSF5，未来只有在真实需求和安全合同明确后才能追加：

- 标签拖拽排序、固定标签、关闭标签恢复、跨重启会话恢复；
- 前进/后退长按历史、完整历史页、书签；
- 按 origin 持久化 zoom；
- 可授予的摄像头、麦克风、定位、通知权限中心；
- Browser Shell 内直接发起新 AgentTask；
- 右键“问 Agent/保存为 JD/对比岗位”等上下文动作；
- 下载文件管理、删除、移动或云端上传；
- 浏览器扩展、密码管理和通用自动填写。

任何延后能力不得因为“Chrome 有”就自动进入范围。

## 12. 阶段状态与写回格式

| 阶段 | 状态 | 开始条件 | 完成证据 |
| --- | --- | --- | --- |
| BSF0 | **已完成（2026-08-30）** | 用户已确认启动 | UI 决策、基线 QA、上级写回 |
| BSF1 | **已完成（2026-08-30）** | BSF0 完成 | focused tests、Electron 导航/失败矩阵 |
| BSF2 | **已完成（2026-08-30；2 项人工门禁移交 BSF5 Windows）** | BSF1 完成 | 标签压测、跨平台快捷键合同、Windows Electron/find/zoom；移交项不计通过 |
| BSF3 | **已完成（2026-08-30；人工体验项移交 BSF5 Windows）** | BSF2 完成 | 48/48 Shell、36/36 Browser Agent、安全 40/40、全量 872 tests |
| BSF4 | **已完成并通过独立质检（2026-08-31）** | BSF3 完成 | 61/61 Shell、36/36 Browser Agent、全量 883 tests |
| BSF5 Windows | **进行中** | BSF4 已闭环 | menu/拼音/视觉/动画/键盘通过；NVDA、真实接管、deep-link 待验收 |
| BE6 | 后续阶段 | BSF5 Windows 门禁完成 | EventKit 与 macOS Calendar 门禁 |
| BSF5 macOS | 待收口 | BE6 完成 | macOS 交通灯、快捷键和真实 BrowserWindow 验收 |

每次写回必须包含：

- 实际修改范围和复用/新增边界；
- 自动化命令、通过数、失败数和跳过项；
- 真实 Electron 的操作路径、平台、主题、尺寸和结果；
- 未完成、失败、降级和仍需用户确认的事项；
- 是否满足进入下一 BSF 阶段的门槛。

不允许因为接口存在、Demo 可见、单站点通过或自动化全绿就提前标记完成。
