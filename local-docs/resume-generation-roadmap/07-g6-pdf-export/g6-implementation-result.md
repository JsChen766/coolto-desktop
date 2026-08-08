# G6 实施与验收记录

> 结论：通过  
> 日期：2026-07-24  
> 范围：本地 PDF 导出审批、系统路径选择、Chromium 打印、postflight、原子写盘

## 1. 最终链路

```text
ready_for_approval candidate / active published variant
→ prepare_resume_pdf_export
→ 本地不可变 Action Approval
→ 用户接受
→ Electron showSaveDialog
→ Chromium 重新 compile
→ compileForPdf
→ A4/页数/文本层/字体/structured 文本 postflight
→ 同目录临时文件
→ 原子 rename 到用户选择路径
```

PDF 不上传，不调用后端 LangGraph，不接受 Agent 提交的本地路径、HTML、像素或 PDF bytes。

## 2. 实现结果

### 来源与审批

- candidate 只允许 revision 匹配且 `ready_for_approval`、quality passed、layout qualified；
- published 只允许 Resume 当前 active、published、passed 且存在 structured 的 variant；
- prepare 前使用同一 Chromium renderer 重新 compile；
- Proposal 深拷贝 structured，并冻结 SHA-256 structure hash、compile 摘要和安全建议文件名；
- reject/custom 不弹对话框、不打印、不写文件；
- 用户取消系统保存对话框返回 `cancelled`，不会声称导出成功。

### 宿主导出

- Electron `showSaveDialog` 是唯一目标路径来源；
- 现有 `ElectronResumeCompilerService.compileForPdf` 是唯一 PDF 生成器；
- 导出时再次核对 qualified、template ID、profile version/hash 和 Proposal structure hash；
- postflight 验证可解析、单页、A4 portrait、文本层、字体资源和实际中英文字体；
- contact name、section heading、item title、raw text 和所有 bullet 可见文本均需存在于
  PDF 文本层；
- 写入同目录随机临时文件后原子 rename；rename 失败会清理临时文件且不报告成功。

### Agent 接线

- 新增 `prepare_resume_pdf_export`，仅桌面 runtime 注册；
- CLI 没有 Chromium 和系统保存对话框，因此不暴露该工具；
- prompt 明确取消、postflight 失败和写盘失败均不得声称已导出；
- G7 之前不增加 Canvas 或直接导出按钮，用户通过自然语言触发现有审批卡。

## 3. 自动化验收

| 范围 | 结果 |
| --- | --- |
| G6 定向测试 | 12 项通过 |
| App `npm run check` | 92 tests passed；typecheck、Node build、Electron build 通过 |
| Chromium/G6 service QA | exported；492,791 bytes；SHA-256 已记录 |
| Layout | 一页；页面占比 87.29%；最低 bullet 尾行 67.65% |
| 内置 postflight | valid；A4 portrait；文本层存在；无 missing fonts |
| 字体 | CJK 实际文本为 SimSun；英文和数字为 Times New Roman |
| Poppler `pdfinfo` | 1 page；594.96 × 841.92 pt；A4；PDF 1.4；Chromium/Skia |
| Poppler `pdftoppm` | 144 DPI PNG 渲染成功 |
| PNG 视觉检查 | 无截断、重叠、黑块、乱码或异常分页 |
| whitespace | `git diff --check` 通过 |

验收 PDF：[g6-export.pdf](../../../output/pdf/g6-qa/g6-export.pdf)  
Poppler 渲染图：[g6-export-poppler.png](../../../output/pdf/g6-qa/g6-export-poppler.png)

## 4. 非上帝类检查

- G6 新增业务文件最大 115 行；
- 现有 `agent-runtime.ts` 接线后 201 行，低于 220 行硬上限；
- compiler service 通过复用和类型抽取保持 195 行；
- 来源解析、Proposal、审批、executor、文件名、PDF 完整性、Electron dialog、原子 writer、
  desktop service 和 QA 分文件；
- 没有修改后端或 Web，也没有新增第二套 renderer。

## 5. 后续边界

- G7 增加 Canvas、正式简历版本选择、直接导出入口和导出进度 UI；
- 当前自然语言导出已可用，published 模式默认导出 Resume 当前 active variant；
- 当前没有导出历史表或云端 PDF Artifact，这是有意的本地隐私边界；
- 若未来支持多页材料，应新增独立 artifact 类型，不能放宽一页简历的 G6 门禁。
