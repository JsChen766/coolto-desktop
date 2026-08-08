# Coolto 简历渲染编译器第一阶段实施计划

> 状态：已完成  
> 版本：v1.0  
> 日期：2026-07-23  
> 上位计划：[总实施计划](../00-foundation/coolto-resume-generation-implementation-plan.md)

## 1. 阶段目标

在不依赖云端 Agent、真实用户数据和完整 App Canvas UI 的前提下，完成可被本地 Pi
Agent 使用的简历“编译器和测试套件”：

```text
ResumeStructure fixture
  → Electron 内置 Chromium 隐藏渲染页
  → Web 同构 DOM/CSS 与固定字体
  → 页面、字体和 bullet 尾行测量
  → 结构化 ResumeCompileResult
  → Chromium printToPDF
  → PDF postflight 和视觉复核
```

第一阶段完成后，后续 `prepare_resume_candidate` 和 `patch_resume_candidate` 可以直接
使用真实像素反馈，不需要字符数估算或模拟布局报告。

## 2. 本阶段不做

- 不接入 Pi Agent 写作工具；
- 不读取真实经历、JD 或 current revision 原文证据；
- 不保存 Resume/ResumeVariant 到云端；
- 不实现用户可见的完整简历 Canvas；
- 不实现拖拽、局部编辑、本地检查点回退或保存审批；产品不提供云端版本对比；
- 不调用云端 LangGraph；
- 不使用测试账号，除非后续出现必须认证的普通业务 API 验证。

## 3. 实现切片

### P1.1 固定契约与 fixtures

- 使用已同步的后端 `resume-layout-templates-v1`；
- 使用已同步的 SimSun 和 Times New Roman；
- 使用与 Web 端兼容的 `ResumeStructure`；
- 建立中文、英文、混排、欠填、溢出和尾行边界 fixtures；
- fixture 中所有 section/item/bullet 使用稳定 ID。

### P1.2 独立 Resume Renderer 页面

- 在 Electron renderer build 中增加独立 `resume.html`；
- 使用普通 HTML DOM 复刻 Web `ResumeDocument.vue` 的 canonical class/attribute 契约；
- 所有页面尺寸、字号、间距和 bullet 参数从 manifest 映射为 CSS variables；
- 不在组件中重复硬编码模板尺寸；
- 固定 section 顺序为教育、工作、项目、专业技能；
- 隐藏页面只加载本地模板、字体和结构化输入。

### P1.3 DOM 编译和测量

- 等待 DOM 更新、`document.fonts.ready` 和两帧 `requestAnimationFrame`；
- 分别验证当前文本实际需要的中英文字体；
- 计算一页可用高度、已用高度、overflow、page count 和 usage ratio；
- 用 `Range.getClientRects()` 按视觉行测量每个 bullet；
- 严格校验 bullet ID 完整性和 `lastLineRatio >= 0.6671`；
- 应用 App 全局 85% 下限，同时保留结构化数据中的 target band；
- 输出带稳定错误码的 `ResumeCompileResult`。

### P1.4 隐藏 Electron 编译服务

- 主进程创建 `show: false` 的隔离 BrowserWindow；
- `nodeIntegration: false`、`contextIsolation: true`、sandbox；
- 使用专用 preload 和窄 IPC 协议传输结构化输入/结果；
- 禁止外部导航、窗口打开和远程网络请求；
- 支持编译、截图和 PDF 打印；
- 编译服务与主聊天窗口和未来招聘浏览器分离。

### P1.5 Chromium PDF 和 postflight

- 使用 `webContents.printToPDF`；
- A4 portrait、CSS page size、零打印边距、背景打印、100% scale；
- 解析 PDF，确认严格一页和 A4 页面尺寸；
- 确认 PDF 文本层存在；
- 检查 PDF 字体资源包含 SimSun/Times New Roman 或对应子集；
- 将 PDF 页面渲染为 PNG 并进行人工视觉复核。

## 4. 结构化输出

```ts
interface ResumeCompileResult {
  fixtureId?: string;
  templateId: ResumeTemplateId;
  profileVersion: string;
  profileHash: string;
  qualified: boolean;
  fontsReady: boolean;
  loadedFontFamilies: string[];
  pageCount: number;
  overflowPx: number;
  usedHeightPx: number;
  availableHeightPx: number;
  usageRatio: number;
  effectiveTargetBand: {
    minimum: number;
    target: number;
    maximum: number;
  };
  bullets: Array<{
    bulletId: string;
    lineCount: number;
    lastLineWidthPx: number;
    availableLineWidthPx: number;
    lastLineRatio: number;
    passed: boolean;
  }>;
  violations: Array<{
    code: string;
    message: string;
    bulletId?: string;
  }>;
}
```

## 5. 测试矩阵

### 确定性单元测试

- manifest/profile/font checksum；
- template → CSS variable 映射；
- section 排序；
- target band 计算；
- 稳定错误码；
- IPC 请求/结果 schema；
- PDF postflight 的页数和尺寸判断。

### 真实 Chromium 回归

- 中文字体加载成功；
- 英文字体加载成功；
- 中英混排两种字体同时加载；
- 标准 A4 页面尺寸；
- 欠填 fixture 触发 `page_underfilled`；
- 溢出 fixture 触发 `page_overflow` / `multiple_pages`；
- 尾行失败 fixture 精确返回 bullet ID；
- 合格 fixture 通过全部质量门；
- 相同 fixture 重复编译结果处于小数像素容差内。

### PDF 回归

- `printToPDF` 生成可解析文件；
- 只有一页；
- 页面尺寸为 A4；
- 文本可提取；
- 字体存在；
- PNG 视觉复核无截断、重叠、黑块或额外空白页。

## 6. 完成定义

第一阶段只有同时满足以下条件才算完成：

- 独立 Resume Renderer 已进入生产构建；
- 使用与 Web 相同的 manifest、字体、DOM class 和关键 CSS；
- fixture 可以通过窄 IPC 在隐藏 Chromium 中编译；
- 页面和 bullet 测量来自真实 DOM；
- 85% 页面门槛、单页、overflow、字体和 0.6671 尾行门槛均有真实回归；
- 至少一份合格 fixture 能生成严格一页的 A4 PDF；
- PDF postflight 和页面图片视觉检查通过；
- `npm run check` 全部通过；
- 本阶段没有使用或持久化测试账号凭据；
- 阶段结果和已知限制回写本文档。

## 7. 实施顺序

```text
1. types/fixtures/纯函数
2. resume.html + canonical renderer
3. preload + main-process compiler service
4. Electron 构建接入
5. 单元测试
6. 真实 Chromium fixtures
7. printToPDF + postflight + PNG 复核
8. 全量检查与阶段结论
```

## 8. 实施结果

完成日期：2026-07-23。

已完成：

- 独立 `resume.html`、专用 sandbox preload 和隐藏 `BrowserWindow` 已进入 Electron
  production build；
- renderer 只接收结构化 `ResumeStructure`，不访问云端 Agent、招聘浏览器或外部网络；
- App 使用已锁定的后端 manifest、SimSun/Times New Roman 二进制和 Web canonical
  DOM/CSS class；
- 页面占用、overflow、page count 和 bullet 尾行均来自真实 Chromium DOM；
- PDF 由同一 renderer 使用 `webContents.printToPDF` 输出；
- PDF.js postflight 会解析压缩字体资源，并按实际文本脚本验证中文映射到 SimSun、
  拉丁字符映射到 Times New Roman；
- 增加 `npm run qa:resume-renderer` 作为真实 Electron 回归入口；
- 测试账号没有在本阶段使用、记录或写入代码与文档。

最终合格 fixture 的真实测量：

| 指标 | 结果 | 门槛 |
| --- | ---: | ---: |
| page count | 1 | 1 |
| overflow | 0 px | ≤ 1 px |
| A4 可用高度 | 1054 px | 固定模板 |
| 已用高度 | 920.0469 px | — |
| 页面占用率 | 87.29% | ≥ 85% |
| bullet 数量 | 18 | — |
| 尾行通过数 | 18/18 | 全部通过 |
| 最低尾行比例 | 67.65% | ≥ 66.71% |
| PDF 页面尺寸 | 594.96 × 841.92 pt | A4 portrait |
| PDF 文本层 | 存在 | 必须存在 |
| 中文文本字体 | SimSun subset | SimSun |
| 拉丁文本字体 | TimesNewRoman subset | Times New Roman |

负向 fixture 已分别稳定触发：

- `underfilled` → `page_underfilled`；
- `tail-failure` → `bullet_tail_too_short`，并返回 `tail-short`；
- `overflow` → `multiple_pages`、`page_overflow` 和 `page_overfilled`；
- profile、字体、缺失/重复 ID 和无效 DOM geometry 均使用失败关闭错误码。

验证命令：

```bash
npm run check
npm run qa:resume-renderer
```

最终结果：41 个确定性测试全部通过，production build 通过；真实 Electron QA 包含
重复编译确定性、中文/英文/混排字体、全部负向 fixture、PDF postflight 和 PNG 视觉复核，
全部通过。视觉检查未发现截断、重叠、黑块或额外页面。

## 9. 已知边界与下一阶段入口

- 本阶段 fixtures 是渲染回归数据，不代表真实用户经历，也不会保存到数据库；
- 英文 fixture 当前主要用于字体和尾行失败诊断，至少一份中文合格 fixture 已满足本阶段
  完成定义；
- PDF postflight 验证真正承载中文/拉丁文本的字体；破折号和 bullet marker 等非中英文字形
  可能由系统宋体子集承载，不影响中英文硬门槛；
- G1 source snapshot、current revision 原文证据和 evidence ledger 已完成；下一阶段把来源、
  Workspace、写作 patch 和已完成的编译器组合为本地 Pi Agent 生成闭环。
