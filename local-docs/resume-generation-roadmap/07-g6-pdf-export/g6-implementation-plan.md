# G6 PDF 导出实施计划

> 状态：已完成并通过自动化、Chromium、Poppler 与 PNG 视觉验收  
> 日期：2026-07-24  
> 前置门禁：G5 App 80 tests、后端 603 tests、Web 41 tests 与真实两次内部发布通过

## 1. 阶段目标

把 G2 已完成的 Chromium `printToPDF` 和 PDF postflight 接入真实桌面产品流程：

```text
ready_for_approval candidate / published active variant
→ prepare_resume_pdf_export（只创建本地不可变审批）
→ 用户接受
→ 系统保存位置选择器
→ 同一 Chromium renderer 重新编译
→ qualified 才允许 printToPDF
→ PDF postflight + structured 关键文本一致性
→ 临时文件完整写入
→ 原子替换用户选择的 .pdf
→ 返回成功 / 取消 / 精确失败
```

G6 不改变后端、不上传 PDF、不引入第二套 HTML/PDF 模板，也不实现 G7 Canvas、本地检查点回退或
直接导出按钮。

## 2. 冻结决策

### 2.1 可导出来源

支持两类来源：

1. `candidate`：只允许当前内存中 `ready_for_approval`、revision 匹配、G4 quality passed、
   Chromium qualified 的候选；
2. `published`：读取指定 Resume 的 current active variant，只允许
   `publication_status=published`、`gate_status=passed` 且存在 structured 的正式版本。

两类来源都必须在创建审批前重新通过 Chromium compile。Agent 不能自行提交 HTML、PDF bytes、
像素数据或任意本地路径。

### 2.2 审批与文件选择

- `prepare_resume_pdf_export` 只冻结 structured、来源 ID、compile 摘要、结构 hash 和建议文件名；
- reject/custom 不弹系统对话框、不打印、不写文件；
- accept 后宿主先弹 `showSaveDialog`，路径只来自用户的系统选择；
- 用户取消保存对话框是正常 `cancelled` 结果，不伪装为失败或成功；
- Agent 不接收任意写入路径参数，不能绕过系统保存位置选择。

### 2.3 PDF 生成和完整性

- 唯一生成器为现有 `ElectronResumeCompilerService.compileForPdf`；
- 打印前重新 compile，并再次要求一页、无 overflow、占比至少 85%、所有 bullet 尾行至少
  66.71%、字体 ready；
- PDF postflight 要求可解析、严格一页、A4 portrait、文本层存在、SimSun/Times New Roman
  匹配且没有缺失字体资源；
- structured hash 在审批后和生成前必须一致；
- contact、section heading、item title、raw text 和每条 bullet 的可见文本必须能在 PDF 文本层
  中找到，防止打印了另一份 DOM；
- PDF bytes 在同目录临时文件完整写入后再原子 rename 到目标路径，失败不报告成功；
- 导出结果记录文件名、字节数、SHA-256、页数和字体门禁，不记录聊天或 Agent 过程。

## 3. 非上帝类模块拆分

```text
src/resume/export/
├── types.ts                 # 来源、Proposal、gateway/result ports
├── source-resolver.ts       # candidate / published fail-closed 解析
├── proposal-builder.ts      # 重新 compile、hash、冻结 payload
├── approval-draft.ts        # 导出审批卡
├── export-executor.ts       # Approval executor，仅调用 gateway
├── filename.ts              # 安全建议文件名
└── pdf-integrity.ts         # postflight + structured 文本一致性

src/desktop/main/
├── resume-pdf-export-service.ts # dialog → compile → verify → atomic write
└── atomic-pdf-writer.ts          # 同目录临时文件与原子 rename

src/tools/resume-candidate/
└── prepare-pdf-export.ts    # 只创建审批，不执行导出
```

接线只最小修改：`create-action-approvals.ts`、`tool registry`、`DesktopAgentRuntime`、
`registerDesktopIpc`、system prompt 和 Electron main。CLI 没有 Chromium/System Dialog，因此不暴露
PDF 导出工具。

规模约束：

- 新增业务文件目标不超过 180 行，硬上限 220 行；
- renderer/compiler、文件选择、postflight、原子写盘、审批和 Agent tool 必须分离；
- 不把导出逻辑塞入已接近 200 行的 compiler service 或 agent runtime；
- 现有文件只做依赖注入和注册，不顺手重构用户改动。

## 4. 实施阶段

### G6-A：领域契约与来源门禁

1. 定义 source input、冻结 Proposal、export gateway/result；
2. 实现 candidate 与 published active variant 解析；
3. 每次 prepare 前重新 compile，拒绝 stale、未发布、未 passed、无 structured 或不 qualified；
4. 生成结构 hash 和 `.pdf` 建议文件名。

### G6-B：审批、工具和宿主执行

1. 新增导出审批 draft 和 executor；
2. 注册 `prepare_resume_pdf_export`；
3. 在桌面 runtime 注入 PDF gateway，CLI 保持不暴露；
4. 更新 prompt：不得声称已导出，取消不算成功，不能索取任意写入路径。

### G6-C：桌面保存、postflight 和恢复

1. 系统 `showSaveDialog` 选择路径；
2. 调用现有 `compileForPdf`；
3. 执行 PDF 结构、字体、页面和 structured 文本一致性检查；
4. 同目录临时文件写入并原子 rename；
5. dialog cancel、compile failure、postflight failure、write failure 均返回准确状态且不误报成功。

### G6-D：真实 Chromium/PDF 验收

1. 单元测试覆盖 candidate/published、审批前零写入、取消、失败和原子写入；
2. App `npm run check`；
3. 真实 Electron Chromium 生成 PDF 和 PNG；
4. 使用 Poppler `pdfinfo`、`pdftoppm` 和现有 postflight 复验；
5. 人工视觉检查 PNG，无截断、重叠、黑块、乱码和字体问题；
6. 检查新增业务文件行数和 `git diff --check`。

## 5. 测试矩阵

- stale candidate revision 拒绝；
- non-ready / quality failed / layout failed candidate 拒绝；
- published source 只允许 current active passed variant；
- Proposal 深拷贝且 structure hash 稳定；
- prepare/reject/custom 的 dialog、compileForPdf、write 调用数均为 0；
- accept 严格执行 dialog → compileForPdf → postflight → atomic write；
- dialog cancel 不生成 PDF、不写文件；
- postflight page/font/text 任一失败不落盘；
- structured 在审批后被篡改时 hash gate 失败；
- 输出扩展名固定 `.pdf`，文件名清除路径字符和控制字符；
- 临时文件写失败或 rename 失败不留下成功状态；
- 真实 PDF 单页 A4、文本层、SimSun、Times New Roman 和关键文本全部通过。

## 6. 完成定义

只有同时满足以下条件才标记 G6 完成：

- candidate 与 published active variant 两条来源均可安全导出；
- 用户接受审批前零文件副作用；
- 路径只来自系统保存对话框；
- 最终 PDF 来自同一个 Chromium renderer；
- layout gate、PDF postflight、structured hash 和关键文本四层门禁全部通过；
- 取消和所有失败路径不误报成功；
- 最新 PNG 视觉检查没有缺陷；
- App 全量检查通过；
- 新增业务文件没有超过 220 行且没有上帝类；
- G6 README、总路线和总实施计划记录真实结果及 G7 边界。
