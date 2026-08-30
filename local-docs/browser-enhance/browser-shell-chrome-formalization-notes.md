# 浏览器外壳"质感"与 Chrome 级正式化：问答记录与方案

> 状态：讨论记录（2026-08-30）。按用户决定**不立项为 BE 阶段、不进入阶段索引**，仅作为背景与方案材料归档；
> 本目录唯一执行入口仍是 [README](./README.md)，本文不构成新的执行路线。
> 文中 `文件:行号` 引用以 `codex/browser-enhance-be0-be5` 分支 2026-08-30 工作树为准，后续代码变动后可能过期。

## 1. 用户诉求（原话摘要）

1. 「现在我想让这个我们自己的浏览器变得更加 AI Native，你认为现在这个浏览器还差些什么？而且我认为现在这个浏览器没什么"质感"，你能帮我把这个质感具体化一些嘛？」
2. 「你说的我都觉得 ok，不仅是你说的这些，我认为还需要将这个浏览器更像 Chrome 那种正式的浏览器。」（选中追问范围：二、"质感"具体化）
3. 归档决定：「把我们讨论的完整问答记录放到 Enhance 那个 roadmap 中但是不要作为一个 BE，只是作为一个文件。」

## 2. 现状摸底结论（2026-08-30）

- Agent 能力层（BE0–BE4）已经很完整：DOM+AX+screenshot 混合感知、16 个原子控制原语、Site Policy、
  DelegationGrant、AgentTask/Checkpoint/Receipt、prompt-injection 防御等；缺口几乎都在"把已有能力表达到界面"。
- 渲染层浏览器外壳总共约 788 行（4 个 Vue 组件 436 行 + CSS 123 行 + composables 161 行 + preload 43 行 +
  入口 25 行），"功能可用但极其朴素"；主进程浏览器模块约 3800 行 / 41 个文件，几乎全是 Agent 管道，
  用户可见的只有 `browser-home-page.ts`（83 行）和 `browser-overlay-scripts.ts`（235 行）。
- 关键事实（抽样）：
  - 无 favicon：全仓库无 favicon 代码；tab 仅渲染标题（`BrowserTabStrip.vue:29`；`BrowserTabState`
    无 favicon 字段，`shared/types/browser.ts:43-50`）；
  - 无加载进度条；reload 不能变 stop（preload 无 stop 通道，`browser-shell-preload/index.ts:10-41`；
    `WebContents.stop()` 从未被调用）；
  - 导航失败落 Chromium 默认灰错误页（`browser-tab.ts:45` 的 `did-fail-load` 只刷新状态）；
  - 无任何快捷键（仅地址栏回车）、无 find-in-page、无 zoom、无定制右键菜单、滚动条为原生裸样式；
  - 新标签页硬编码 `color-scheme: light` 与中文文案，不吃深色主题与 i18n
    （`browser-home-page.ts:11,71-74`）；"新标签页"标题与地址栏 placeholder "Coolto 主页"命名不一致；
  - `BrowserAgentBar.vue` 仅单行 `message · goal`，长目标截断且无 tooltip，无步骤/进度/当前动作；
    `BrowserAgentStatusBridge` 只传单个快照；tab 条无 Agent 焦点指示；
  - 下载有 `browser-download-tracker.ts` 但无任何 UI 消费；
  - `use-browser-state.ts:22` 残留"地址栏只读"过时注释；
  - 全壳视觉最完整的部件是填写复核 overlay（`browser-overlay-scripts.ts`，含字段 ✓/✗ 徽章与顶栏）。

## 3. 第一轮问答：AI Native 还差什么 & "质感"具体化

### 3.1 AI Native 缺口（browser-enhance 路线未覆盖的部分）

路线内已排期项（BE5 邮件信号、BE6 Calendar、BE7 Scout/Follow-up/Briefing/Strategy Learner、
BE8 真实验收）不重复列。缺口集中在"感知能力已有、表达层缺失"：

1. **Agent 的感知和动作对用户不可见**：`browser-accessibility-tagger.ts`、`browser-element-scripts.ts`
   均为纯数据提取，不注入任何视觉；页面上唯一的可视化是填写复核 overlay。缺：点击前目标元素高亮
   描边、填写涟漪反馈、"Agent 已读取此页"痕迹。没有这层，用户对 Agent 的信任只能靠聊天文字。
2. **浏览器窗口内没有 AI 的主动入口**：用 AI 只能回聊天框打字。`extract_page` 只是模型工具，不是
   用户可触达功能。缺：选中文字→"问 Agent / 存为 JD 事实"、右键 Agent 动作（摘要此页、提取
   requirements、对比岗位）、地址栏旁"让 Agent 读这个页面"。
3. **Agent 状态表达过薄**：Agent 条单行截断无进度；tab 无"Agent 正在这个标签工作"焦点指示；
   Agent Tasks 页的时间线离浏览器上下文太远，点 Agent 条应能展开当前 run 时间线。
4. **新标签页不智能**：写死的 Bing 搜索框，硬编码浅色。应展示：运行中托管任务、最近信号、
   常用岗位源、快速发起委托入口。这是浏览器里唯一完全属于自己的画布。
5. **等待/失败状态没有接管页面**：任务 `waiting`（等接管登录、等验证码）只有 Agent 条一行小字；
   应有页面级 interstitial："Agent 在等你完成登录"+ 接管按钮，把人机交接做成正式界面。
6. **浏览器基础效率件为零**：无快捷键、find-in-page、zoom、右键菜单、下载 UI。当用户频繁
   "接管→交还"时，键盘效率就是可用性。

### 3.2 "质感"的定义与七个层次

质感 = **用户在每一个状态变化里都收到恰当、即时的反馈**。

1. **身份层**：favicon（tab + 地址栏）、品牌化错误页、与主题联动的新标签页。favicon 是
   "这是一个真浏览器"最便宜也最有效的一笔。
2. **加载反馈连续性**：地址栏下方 2px 进度条（80% 前缓进、收尾快跳）、加载中 reload↔stop 切换、
   spinner→favicon 交叉淡入。
3. **信任可视化（AI 浏览器特有）**：地址栏锁形/来源图标、授权徽章（"Agent 只读"/"托管中·投递授权"）、
   用户接管时 chrome 边界变化（强调色描边）。
4. **微交互与可访问性**：过渡动画（tab 切换、Agent 条出现不硬切）、focus-visible 环、tooltip、
   `aria-label`、统一滚动条样式——UI 规范第 6 节的要求在外壳尚未落实。
5. **排版与密度策略**：tab 弹性收缩、溢出渐隐遮罩、hover 完整标题 tooltip、中键关闭。
6. **键盘效率**：Ctrl+L/T/W/F、Esc 停止——"专业工具"手感的下限。
7. **正确性瑕疵一次性清扫**：标题命名不一致、home 不吃 dark mode/i18n、过时注释、下载无 UI。

## 4. 第二轮问答：Chrome 级正式化方案（B1–B5 + P2）

用户追加要求后，将上述内容合并为分批方案。基准线：Chrome。

**总原则**：不引入第二套主题/图标库，全部走 `tokens.css` + Lucide + 既有卡片规则；主进程只加薄适配层
（favicon、find、zoom、菜单、快捷键是围绕 `BrowserTabManager` 的独立小模块，不碰 Agent 架构）；
每个文件遵守 250 行门禁（`BrowserTabStrip` 拆出 TabItem，`BrowserShell` 拆出 AddressBar）。

### B1 导航与加载反馈（最影响"是不是个真浏览器"）

- **Favicon**：主进程监听 `page-favicon-updated`，带 content-type 校验和内存缓存；取不到时用域名
  首字母 + token 色板 letter avatar 兜底。出现在 tab、地址栏左侧；加载中 favicon 位置显示 spinner，
  完成后交叉淡入。
- **顶部进度条**：地址栏下方 2px。Chromium 不暴露真实进度，用真实导航事件
  （start/commit/domReady/frameFinish/stop）驱动模拟进度。
- **Reload ↔ Stop**：加载中切换为 ✕（补 stop 通道），Esc 优先关查找条、其次停止加载。
- **品牌化错误页**：拦截 `did-fail-load`（过滤用户主动中止），按主题渲染：错误码
  （ERR_NAME_NOT_RESOLVED 等）+ 一句人话 + "重试/回主页"，不做假按钮。
- **主页修正**：去硬编码浅色与中文，接 i18n，统一"新标签页"命名。

验收：真实 Electron 打开 outlook / 163 / 不存在域名 / 断网四场景，深浅色逐一核对 favicon、
进度条、错误页；200% 缩放不破版。

### B2 Tab 条与地址栏 Chrome 化

- Tab 弹性收缩（最小宽度、激活 tab 稍宽），溢出两端渐隐遮罩替代裸滚动条；hover 才显示关闭钮；
  中键关闭；tooltip 显示完整标题 + URL。
- 地址栏：左侧来源图标（https 锁 / http "不安全" / 主页无），聚焦全选，Ctrl+L 聚焦。
- 快捷键体系（统一路由，页面聚焦时同样生效）：

| 动作 | Windows | macOS |
| --- | --- | --- |
| 聚焦地址栏 | Ctrl+L | ⌘L |
| 新标签 / 关闭标签 | Ctrl+T / Ctrl+W | ⌘T / ⌘W |
| 切换标签 | Ctrl+Tab / Ctrl+Shift+Tab | ⌘⇧⇥ |
| 定位第 N 个标签 | Ctrl+1..8，Ctrl+9 末尾 | ⌘1..9 |
| 刷新 / 停止 | Ctrl+R、F5、Esc | ⌘R |
| 页内查找 | Ctrl+F | ⌘F |
| 缩放 | Ctrl+加/减/0 | ⌘加/减/0 |
| 前进后退 | Alt+←/→ | ⌘[ / ⌘] |

- 关闭最后一个 tab = 关窗口（对齐 Chrome 语义）；窗口标题同步激活 tab 标题。

验收：12+ 标签压测收缩与渐隐；纯键盘走完"开关切、缩放、查找"一圈不碰鼠标。

### B3 页内能力（find / zoom / 右键菜单）

- **页内查找条**：`findInPage` + 匹配计数（3/17）、Enter 下一个、Shift+Enter 上一个、Esc 关闭。
- **缩放**：per-tab `setZoomLevel`，地址栏内缩放徽章可点回 100%；v1 仅内存级，按 origin 持久化放 P2。
- **定制右键菜单**：按 Chrome 分区（页面：后退/前进/刷新；链接：新标签打开/复制链接；选区：复制/搜索；
  图片：复制/另存）。"问 Agent"等 AI 菜单项本期不做——工具链没接通前不显示无效按钮（UI 规范第 7 节）。
- 滚动条统一 `::-webkit-scrollbar` 样式，深浅色各一套。

### B4 信任与 Agent 可见层（AI 浏览器差异点）

- 地址栏右侧授权徽章：**Agent 只读 / 托管中 / 我在操作**，颜色 + 图标 + 文字三重编码
  （颜色不作为唯一状态来源）。
- Agent 当前工作的 tab 显示焦点指示（小圆点/描边），Agent 切 tab 用户立刻可见。
- Agent 条可展开：当前步骤、目标、最近 3 条动作；"查看完整时间线"跳 Agent Tasks 页。
- 用户接管时 chrome 明确边界（强调色细描边 + 徽章切换"我在操作"）。
- 页内动作高亮：Agent 点击前目标元素短暂描边闪烁、填写复用现有 overlay 视觉语言。

### B5 下载与主页 v2

- **下载气泡**：消费已有 `browser-download-tracker.ts`，工具栏下载图标 + 进度 + 完成态。
- **主页 v2**：主题化基础上加"运行中/等待中的 Agent 任务"卡片和邮箱连接入口。
  最近站点网格不做——没有历史记录追踪，不造假数据。

### P2（明确延后）

拖拽排序 tab（做时配点击替代路径）、固定 tab、会话恢复 + Ctrl+Shift+T、前进后退长按历史、
站点信息气泡、按 origin 持久缩放、权限请求策略（v1 默认拒绝不弹窗）、右键 AI 动作接入工具链。

### 四个边界决定（已向用户声明，未提出异议）

1. AI 右键动作不做假入口；
2. 拖拽 / 固定 tab / 会话恢复全部放 P2；
3. 权限弹窗 v1 不做，静默拒绝；
4. 下载用工具栏气泡，不做 Chrome 底部 shelf。

## 5. 结论与后续

- 2026-08-30 用户确认方向：接受全部缺口判断，并追加"像 Chrome 那种正式浏览器"要求。
- 方案按 B1→B5 分批，每批独立交付：`npm run check` + 真实 Electron 人工清单
  （深浅色 / 200% 缩放 / 940px 窄窗 / 纯键盘，按 UI 规范第 6 节），不做 commit。
- 归档方式：按用户决定，本讨论**不立项为 BE 阶段**、不进入 README 阶段索引，仅以本文件存在；
  开工批次与实施入口由用户后续指定。未开工前不改动任何代码。
