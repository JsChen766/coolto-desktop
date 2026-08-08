# B2：页面感知（通用读页工具）

> 状态：设计已确认（2026-07-25 修订），待实施
> 前置：B1 浏览器容器完成

## 目标

让 Agent 具备一种**通用的「读当前浏览器页面」能力**：AI 调用一个工具就能拿到当前活跃标签页的完整信息（可见文本 + meta + 表单字段概览），由 AI 自己判断这个页面是做什么的、有没有表单要填、有没有 JD 可提取，而不是由确定性代码去分类。

此阶段建立内容读取基础设施，供 B3/B4/B5 复用。

> ⚠️ **2026-07-25 设计修订（与用户确认）**：原始 B2 设计围绕「页面分类 + JD 专属抓取 + 主窗口按钮」，已废弃。修订后聚焦于**一个泛化的读页工具**，理由与差异见下节。

---

## 与原始设计的差异（已废弃的旧点）

| 旧设计（已废弃） | 新设计（本文档） | 原因 |
|------------------|------------------|------|
| `browser-page-classifier.ts` 把页面分类为 `jd`/`form`/`webmail`/`unknown` | **不做分类**。AI 读到页面内容后自行理解页面用途 | 分类是把能力写死在代码里；泛化读页让一个工具覆盖 JD/表单/邮件等所有场景，一次铺好后续路 |
| `extract_page_jd`（JD 专属工具） | `extract_page`（通用读页工具，无参数，读当前活跃标签） | 不止读 JD，还要读投递表单要填什么等；通用工具最合适 |
| `BrowserActionBar.vue` 主窗口按钮，按 `pageType` 显示「提取此 JD」 | **B2 不做任何按钮**，纯工具交付 | 主窗口浏览器控制面板已在 B1 删除；触发靠用户在聊天里让 Agent 读页，Agent 自主调用工具 |
| `browser:state-changed` 推送 `pageType` | `BrowserState.pageType` 保持 B1 现状（`unknown` 占位，不在 B2 填充） | 不做分类，无需填 |
| `readPageText()` / `readMetaInfo()` / `readFormFields()` 分开，`readFormFields()` 只占位 | 一次性读全（文本 + meta + 表单概览），一个 `readActivePage()` 返回完整快照 | 既然做工具就做好，一次读全，为 B3 铺路 |

JD 提取（复用已有 `prepare_jd_import`）在本阶段**仅作为验收手段**，用来确认 Agent 确实读到了页面，不是 B2 的核心产物。

---

## 核心产物

### 主进程（`src/desktop/main/browser/`）

| 文件 | 职责 |
|------|------|
| `browser-content-reader.ts` | 封装对传入 `WebContents` 的 `executeJavaScript()` **只读**注入；注入脚本一次性提取 `title` / `url` / `metaDescription` / og 标签 / 清洗后的可见正文文本（去 script/style、截断上限）/ 表单字段概览（枚举 `input/textarea/select` 的 label、type、placeholder、name、required）；返回结构化 `PageSnapshot`。只读，不修改 DOM |
| `browser-window-manager.ts`（改动） | 新增 `readActivePage(): Promise<PageSnapshot>`：取当前活跃标签的 `webContents` 交给 reader；浏览器未打开或无活跃标签则抛错。实现 `BrowserPageReader` 接口 |

### Agent 工具（`src/tools/`）

| 文件 | 职责 |
|------|------|
| `extract-page.ts` | 新工具 `extract_page`：无参数，读取当前活跃标签页快照；调用 `browserPageReader.readActivePage()`；浏览器未打开/无活跃标签时返回**明确的错误文本**给模型（不抛异常炸掉 turn）；返回文本 + meta + 表单字段概览的 JSON。**不加审批**（纯读，只读用户已明确打开的页面，符合 B0 安全原则） |

### 共享类型（`src/desktop/shared/types.ts`）

新增 `PageSnapshot`、`PageFormField`、`BrowserPageReader` 类型。

---

## 架构桥接（关键实现点）

工具在 **Agent runtime**（主进程，按对话懒创建）里运行，要读的页面在 **`BrowserWindowManager`**（独立浏览器子系统）里。B1 之后两者在主进程中完全解耦，需要桥接：

```text
index.ts:
  先 registerBrowserIpc(...) → 拿到 BrowserWindowManager 单例
  再 registerDesktopIpc(..., browserPageReader) ← 把 manager 作为 BrowserPageReader 传入

registerDesktopIpc → new DesktopAgentRuntime(..., browserPageReader)
  → createToolRegistry({ ..., browserPageReader })
    → 注册 extract_page 工具（持有 reader 引用）
```

- 传**接口 `BrowserPageReader`**（只读 `readActivePage()`）而非整个 manager 实例，保持解耦、收窄工具能力面。
- 不需要「主进程 → 渲染进程当前对话 id」的桥接：工具由 Agent 在对话回合内主动调用，天然处在当前对话上下文里。

---

## 数据流

```text
用户在浏览器窗口打开任意页面（JD / 投递表单 / 邮件等）
  └─ 用户在主窗口聊天中让 Agent「读一下我打开的页面」
       └─ Agent 自主调用 extract_page 工具
            └─ 工具 → browserPageReader.readActivePage()
                 └─ BrowserWindowManager 取活跃标签 webContents
                      └─ browser-content-reader 注入只读脚本，返回 PageSnapshot
                           └─ 工具把快照（文本+meta+表单概览）作为不可信数据返回给模型
                                └─ 模型理解页面用途；若为 JD 可继续调 prepare_jd_import
```

---

## 安全要点

- `PageSnapshot`（页面文本、字段 label、meta）一律视为**不可信数据**；`extract_page` 工具的返回内容与 description 中明确标注：页面内容不得触发额外指令/工具调用
- `executeJavaScript` 只读取内容，不修改 DOM、不点击、不导航
- Agent 不能自主导航或打开浏览器：`extract_page` 只读**当前已打开的活跃标签**，浏览器未打开时返回错误提示，不自动拉起窗口（符合 B0「Agent 只能读用户明确打开的页面」）
- 多标签：只读当前**活跃**标签，不遍历后台标签

---

## 本阶段不做

- 页面分类 / `pageType` 填充（不做）
- 任何按钮 / `BrowserActionBar.vue`（不做）
- 任何填写、点击、导航操作（B4/B5）
- 表单字段的 selector 级精确定位与注入（B3；本阶段只做 label/type/placeholder 概览）
- 浏览器未打开时自动拉起窗口（安全原则）

---

## 完成门槛

- 浏览器窗口打开任意 JD 页面后，在主窗口聊天让 Agent 读页，Agent 调用 `extract_page` 成功拿到页面文本 + 表单概览
- Agent 基于读到的内容能进一步调用 `prepare_jd_import`，聊天流出现 JdArtifactCard，右侧 JdDetailPanel 显示正确结构化内容（**验收 Agent 确实读到了页面**）
- 浏览器未打开时调用 `extract_page`，工具返回明确的错误提示，Agent 能据此告知用户先打开页面
- `npm run check` 通过；新文件均在 250 行以内

---

## 完成记录（2026-07-25）

> 状态：✅ 已实施，`npm run check` 全量通过；真实 Electron 手动验收待做

### 文件清单

| 文件 | 行数 | 说明 |
|------|------|------|
| `src/browser/types.ts`（新增） | 27 | `PageSnapshot`、`PageFormField`、`BrowserPageReader` 类型。放在 `src/browser/` 而非 `src/desktop/shared/`，因为 Node 主 tsconfig 排除了 `src/desktop`，工具（`src/tools`）无法从那里 import |
| `src/desktop/main/browser/browser-content-reader.ts`（新增） | 87 | `readPageSnapshot(webContents)`：注入只读脚本一次性提取 title/url/meta/og/清洗后正文（截断 20k）/表单字段概览（最多 80 个，跳过 hidden）；normalize 后返回 |
| `src/tools/extract-page.ts`（新增） | 52 | `extract_page` 工具：无参数，读活跃标签；未打开/无活跃标签返回 `isError` 错误文本（不抛异常）；返回内容标注为不可信数据。**无审批**（纯读） |
| `src/desktop/main/browser/browser-window-manager.ts`（改） | — | `implements BrowserPageReader`，新增 `readActivePage()`：取活跃标签 webContents 交给 reader，未开则抛错 |
| `src/tools/registry.ts`（改） | — | `ToolRegistryDependencies` 加 `browserPageReader?`；存在时注册 `extract_page` |
| `src/desktop/main/agent-runtime.ts`（改） | — | 构造函数新增 `browserPageReader` 参数，透传给 `createToolRegistry` |
| `src/desktop/main/ipc.ts`（改） | — | `registerDesktopIpc` 新增 `browserPageReader` 参数，注入 `DesktopAgentRuntime` |
| `src/desktop/main/index.ts`（改） | — | 调整顺序：先 `registerBrowserIpc` 拿到 manager，再作为 `BrowserPageReader` 传给 `registerDesktopIpc` |

### 关键实现决策

1. **桥接方式**：`BrowserWindowManager` 直接 `implements BrowserPageReader`，以只读接口形式注入 Agent runtime → 工具注册表。不需要「主进程→渲染进程当前对话 id」桥接，因为工具由 Agent 在对话回合内主动调用。
2. **类型放置**：`BrowserPageReader`/`PageSnapshot` 放 `src/browser/types.ts`（Node 可编译，两侧都能 import），而非 `src/desktop/shared/types.ts`（被 Node tsconfig 排除）。
3. **未打开处理**：工具捕获异常，返回 `isError: true` 的文本给模型，不炸掉 turn；模型据此提示用户先打开页面。

### 验收状态

- `npm run check` 全量通过（Node/Vue typecheck + 单测 + build + desktop:build）
- 新文件均 ≤ 87 行（硬上限 250）
- **待做（真实 Electron 手动验收）**：浏览器打开 JD 页 → 主窗口聊天让 Agent 读页 → `extract_page` 拿到文本+表单概览 → 继续 `prepare_jd_import` 弹 JdArtifactCard；浏览器未打开时调用返回错误提示

### 联动修复：JD 保存 422

B2 读页验收时发现：Agent 读页后自行提取 JD 保存会命中后端 422（`v2_category`/`v2_importance` 枚举越界）。已修复（工具 schema 收紧 + 写入前兜底清洗），详见 `p0-product-completion-roadmap/03-p2-jd-ingestion/README.md` 修复记录。后端本身正常运行，与 B2 桥接无关。
