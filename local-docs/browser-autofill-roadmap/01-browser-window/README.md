# B1：浏览器容器

> 状态：✅ 已实施（2026-07-25），`npm run check` 通过；真实 Electron 手动验收待做  
> 前置：B0 技术选型确认

## 目标

交付一个可用的内置浏览器窗口，具备：基本导航、Cookie 持久化、页面加载感知、与主进程双向通信。

此阶段不涉及任何内容读取或填写，只建立浏览器的"基础设施层"。完成后，用户可以在 App 内打开一个真实浏览器，访问任何网页，且登录状态在会话间保留。

---

## 核心产物

### 主进程（`src/desktop/main/browser/`）

| 文件 | 职责 |
|------|------|
| `browser-window-manager.ts` | 管理 BrowserWindow 生命周期（创建/销毁/聚焦）；维护单例，保证同一时间只有一个浏览器窗口 |
| `browser-session.ts` | 初始化 `session.fromPartition('persist:browser')`；配置 Cookie 存储路径；隔离于主窗口 session |
| `browser-navigation.ts` | 封装 navigate / goBack / goForward / reload 操作；转发 `did-navigate`、`page-title-updated`、`did-start-loading`、`did-stop-loading` 事件 |
| `browser-ipc-channels.ts` | 所有 IPC 通道名称常量（来自 B0 契约） |
| `browser-ipc.ts` | 注册 `browser:open`、`browser:close`、`browser:navigate`、`browser:go-back`、`browser:go-forward`、`browser:reload` 处理器 |

### Renderer（`src/desktop/renderer/src/`）

| 文件 | 职责 |
|------|------|
| `browser/use-browser-state.ts` | Composable：订阅 `browser:state-changed`，暴露 `isOpen`、`currentUrl`、`pageTitle`、`isLoading` 等响应式状态 |
| `components/BrowserControlBar.vue` | 浏览器控制面板：地址栏（只读，不可编辑 URL，安全考虑）、打开/关闭按钮、后退/前进/刷新按钮、加载指示 |

### 共享类型（`src/desktop/shared/types.ts`）

新增 `BrowserState` 类型（来自 B0 契约）。

---

## 行为规格

### 窗口生命周期

- App 启动时不自动打开浏览器；用户点击按钮或 Agent 触发时打开
- 浏览器窗口关闭后 Cookie 保留（`persist:` 前缀）
- 主窗口关闭时浏览器窗口一并关闭
- 同一时间只允许一个浏览器窗口实例（再次触发打开时聚焦已有窗口）

### 地址栏

- 显示当前 URL，用户不能直接在 App 内输入 URL 导航（安全原则：避免 App 被用作任意 URL 跳板）
- Agent 可通过 IPC `browser:navigate` 导航到 proposalId 指定的 URL（需用户审批的操作）
- 用户可在浏览器窗口内直接点击链接正常导航

### Session 隔离

- `session.fromPartition('persist:browser')` — Cookie 跨会话保留
- 不共享主窗口的 session（主窗口是 `defaultSession`）
- 不为不同网站创建不同 partition（统一一个 browser partition）

---

## 本阶段不做

- 任何 DOM 读取或内容脚本注入（B2）
- 表单识别或填写（B3/B4）
- 页面类型检测（B2）
- Agent 工具接入（B2+）
- 浏览器控制面板与聊天 UI 的深度集成（B6）

---

## 完成门槛

- 点击 App 内按钮，独立浏览器窗口正常打开并加载目标页面
- 在浏览器中登录 Boss 直聘，关闭窗口后重新打开，登录状态保留
- BrowserControlBar 正确显示页面标题、加载状态、后退/前进可用状态
- `browser:state-changed` 事件在页面导航期间持续正确推送
- `npm run check` 通过；新文件均在 250 行以内

---

## 完成记录（2026-07-25）

### 架构变更：B0-D1 修订

**修订点**：浏览器窗口不再使用独立 `BrowserWindow` + 单一 `webContents`，改为：

- 浏览器 `BrowserWindow` 的主 webContents 加载 **Vue chrome**（标签栏 + 地址栏 + 导航按钮 + 嵌入式窗口控制按钮）
- 每个标签页用独立的 `WebContentsView` 承载，只显示当前激活标签
- `_blank`/`window.open` 链接在本窗口开新标签页，不再弹新窗口
- 窗口采用**无原生边框/菜单栏**嵌入式设计：macOS 用 `titleBarStyle: "hiddenInset"`（保留原生红绿灯，左侧留 78px 间距），Windows 用 `frame: false`（Vue 渲染最小化/最大化/关闭按钮）
- 主题适配：`BrowserShellState` 携带 `theme` 字段，`BrowserShell.vue` 根据值 toggle `document.documentElement.classList.toggle("dark", ...)`，复用 App tokens

### 修复的 Bug

**1. 第二次打开报错（时序竞态）**：`closed` 事件中 `this.#window = undefined` 与后续 `pushState` 的时序竞态。修复：`closed` handler 加 `if (this.#window !== window) return;` 窗口身份校验，只清理自己的窗口。

**2. 关闭时 `Object has been destroyed`**：`closed` 触发时窗口已销毁，`destroyAll()` 内访问 `this.window.contentView.removeChildView` 抛错。修复两处：
- `closed` handler 不再调 `destroyAll()`——窗口销毁时子 `WebContentsView` 已被 Electron 自动清理，只置空引用即可。
- `destroyAll()`（仅主窗口关闭时经 `dispose()` 调用）加 `!this.window.isDestroyed()` 守卫。

**3. 标签栏无法拖拽窗口**：原先整个 `tab-strip`/`window-controls` 容器加了 `no-drag`，导致标签栏空白区也不可拖。修复：改为只给具体交互元素（`.tab` / `.tab-new` / `.window-controls`）加 `no-drag`，标签栏空白区恢复 `-webkit-app-region: drag`。

**4. 窗口控制按钮贴底对齐**：`BrowserWindowControls` 原 `align-self: flex-start` 导致按钮贴标签栏底部。修复：移除组件内 `align-self`，在 `BrowserShell` 用 `.chrome-top :deep(.window-controls) { align-self: center }` 使其在标签栏内垂直居中。

### 文件清单

#### 主进程（`src/desktop/main/browser/`）

| 文件 | 行数 | 说明 |
|------|------|------|
| `browser-ipc-channels.ts` | 40 | IPC 通道常量 + chrome shell 通道 |
| `browser-session.ts` | 18 | `session.fromPartition('persist:browser')` 单例 |
| `browser-home-page.ts` | 83 | 自定义主页：纯黑"Coolto" + 搜索框，回车 Bing |
| `browser-tab.ts` | 96 | 单个标签 `WebContentsView`，`_blank` 拦截为 `onOpenUrl` 回调 |
| `browser-tab-manager.ts` | 134 | 标签集合管理：新建/关闭/切换/布局，派生 `BrowserState`/`BrowserShellState`；`destroyAll` 加窗口存活守卫 |
| `browser-window-manager.ts` | 195 | 窗口生命周期 + frameless 配置 + 主题 + 窗口控制 + 身份校验修复 |
| `browser-ipc.ts` | 98 | 主窗口 invoke + chrome shell 事件注册 |

#### Chrome renderer（`src/desktop/renderer/src/browser-shell/`）

| 文件 | 行数 | 说明 |
|------|------|------|
| `main.ts` | 14 | 入口，声明 `window.browserShell` 全局类型 |
| `BrowserShell.vue` | 215 | 顶栏：标签条 + 地址栏 + 窗口控制 + 可拖拽区 + 主题切换；控制按钮 `align-self: center` |
| `BrowserTabStrip.vue` | 142 | 标签条组件（标题/加载动画/关闭按钮/新建按钮）；仅交互元素加 `no-drag` |
| `BrowserWindowControls.vue` | 71 | Windows 嵌入式最小化/最大化/关闭按钮，关闭按钮 hover 红色，容器 `no-drag` |
| `browser-shell.css` | 19 | 基础样式（全高、字体、背景色） |

#### Preload（`src/desktop/browser-shell-preload/index.ts`）

- 37 行，新增 `minimizeWindow` / `toggleMaximizeWindow` / `closeWindow` / `platform` 属性

#### 共享类型（`src/desktop/shared/types.ts`）

新增：`BrowserTabState`、`BrowserShellState`（含 `theme`/`platform`/`isMaximized`）、`BrowserShellApi`（含 `platform`/`minimizeWindow`/`toggleMaximizeWindow`/`closeWindow`）

#### 配置变更

`electron.vite.config.ts`：preload 增加 `browser-shell` 入口，renderer 增加 `browser-shell` 入口。

#### 删除

- `browser-navigation.ts` 已删除（合并到 `browser-tab.ts` + `browser-tab-manager.ts`）
- `BrowserControlBar.vue` 已删除（浏览器窗口自带 chrome，不再需要主窗口控制条）

### 与 roadmap 的差异（已与用户确认）

1. **B0-D1 修订**：独立 `BrowserWindow` → `BrowserWindow` 内含 Vue chrome + 多 `WebContentsView` 标签页
2. **标签条位置**：浏览器窗口内自带，不在主窗口
3. **主页颜色**：纯黑，无主题色，对齐 App tokens
4. **地址栏**：只读（安全原则），导航靠主页搜索框 + 页内链接
5. **窗口样式**：无原生边框，嵌入式窗口控制按钮（macOS 保留原生红绿灯，Windows 纯 Vue 渲染）
6. **深浅色模式**：BrowserShell 根据 `theme` 字段 toggle `document.documentElement.classList.toggle("dark")`，同步 App 主题
7. **跨平台**：`BrowserShellState.platform` 传递 `process.platform`，`BrowserWindowControls` 仅在非 macOS 渲染

### 验收状态

- `npm run check` 全量通过（Node typecheck + Vue typecheck + 单测 + build + desktop:build）
- 所有新文件 ≤ 215 行（硬上限 250）
- 主进程 Electron 模块无法在 `node --test` 下运行，靠类型检查 + 真实 Electron 手动验收覆盖
- **待做（真实 Electron 手动验收）**：关闭后再次打开不报错（无 `Object has been destroyed`）、多标签新建/切换/关闭、Boss 直聘登录态跨会话保留、窗口控制按钮功能与居中对齐、按住标签栏空白区可拖动窗口、深色/浅色模式切换、后退/前进禁用态

### 后续修订（2026-07-26，B5 手动验收前置）

**地址栏由只读改为可编辑**：原设计（本 README 第 50、152 行）地址栏只读，导航仅靠主页搜索框 + 页内链接。B5 手动验收需要用户手动导航到本地验收页（`file://`），故开放地址栏输入。

- 交互：地址栏改为 `<input>`，回车导航；聚焦全选、失焦回填当前 URL。
- URL 规范化在 `BrowserShell.vue` 完成：带协议（`http/https/file/data` 等）直接用；形如域名（含点、无空格）补 `https://`；其余当搜索词走 Bing。
- 新增 shell `navigate` 通道链路：`browser-ipc-channels.ts`（`BROWSER_SHELL_CHANNELS.navigate`）→ `browser-ipc.ts`（`registerShellHandlers` 接 `manager.navigate`）→ `browser-shell-preload/index.ts`（暴露 `navigate`）→ `BrowserShellApi.navigate(url)`（`shared/types.ts`）。
- 安全说明：`did-navigate` 到新 origin 仍会触发写权限闸门硬收回（B3 逻辑不变），可编辑地址栏不影响读写分离边界。
- `npm run check` 全量通过（181 tests）。

### 后续修订（2026-07-29，桌面 Chromium 兼容 UA）

**问题证据**：相同网络下系统浏览器可正常访问 IEEE Xplore，内置浏览器收到
`Unusual Traffic Detected (Error 418)`；代码复核确认网页标签此前使用 Electron 默认
User-Agent，未配置桌面 Chromium 兼容身份。

**真实完成**：

- 新增 `browser-user-agent.ts`，按 macOS、Windows、Linux 生成 Chromium reduced
  desktop UA；版本始终读取 `process.versions.chrome` 的主版本，避免宣称与实际引擎
  不一致的能力。
- `BrowserTab` 在首次导航前通过 `webContents.setUserAgent()` 应用该 UA；常规请求头与
  `navigator.userAgent` 不再包含 `Electron/<version>` 或 App 名称。
- 保留原生 Chromium Client Hints、操作系统语言、`persist:browser` Cookie/缓存以及
  sandbox、context isolation、webSecurity 默认值；未注入 stealth 脚本，未修改
  `navigator.webdriver`，未清除现有站点数据。
- 新增 `test/browser-user-agent.test.ts`，覆盖 Chromium 主版本绑定、三种桌面平台 token、
  Electron/App 标识移除及非法版本拒绝。

**验证证据**：

- `npm run check` 全绿：396 个源文件行数门禁通过，243 个单测通过，Node/Desktop
  typecheck、Node build 与 Electron production build 均通过。

**仍待真实 Electron 手动验收**：

- 完全退出并重启 App 后，新建标签访问 UA 检测页，确认 UA 为当前桌面平台的
  `Chrome/150.0.0.0` 且不含 Electron/App token。
- 在不清除 `persist:browser` 数据的前提下重试 IEEE Xplore，并验证典型招聘网站；
  站点仍可能根据 Client Hints、TLS、Cookie 或行为风控拒绝，不能因 UA 单测通过而宣称
  IEEE 已放行。
- 依赖 `window.opener` 的 OAuth/登录弹窗兼容性不在本次修改范围，现有 `_blank` 转标签
  行为保持不变。
