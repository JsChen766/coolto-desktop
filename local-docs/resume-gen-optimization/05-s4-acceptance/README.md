# S4 测试与验收

> 状态：真实模型评测通过；待真实账号资产端到端 + PDF 导入验证
> 完成日期：2026-08-12

## 验证证据

| 项 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm run desktop:typecheck` | 通过 |
| `npm run test` | 418 pass / 4 fail，4 个失败均为 macOS 专属环境断言（`/tmp/`、`/Applications/`、`/bin/bash`），与本次改造无关 |
| `npm run build` | 通过 |
| `npm run desktop:build` | 通过 |
| `npm run check:source-lines` | 595 文件全部 ≤250 行 |
| 新工具单测 | `test/agent-orchestrated-tools.test.ts` 10/10 |
| Agent 编排循环 | `test/resume-agent-loop.test.ts` 2/2（faux provider，含拒绝-修正路径） |
| CLI PDF 导出 | `npm run pdf:export` 端到端成功：`local-output/demo-resume.pdf`（480KB，`%PDF-1.4` 头验证） |

## CLI 基础设施验收

1. **生成工具链注册**：`src/cli/main.ts` 已传 `agentOrchestrated`（CliSemanticCompiler + store），
   CLI 可完整跑 Agent 编排状态机
2. **语义编译**：`src/cli/semantic-compiler.ts`（占用率由 bullet 数驱动，支持无 Electron 自测）
3. **PDF 导出**：`src/cli/pdf-export-entry.ts` + `npm run pdf:export`
   - esbuild bundle → `out/cli/pdf-export-entry.cjs` → electron 运行
   - 复用 `ElectronResumeCompilerService`（out/preload、out/renderer 相对路径天然成立）
   - 未达标时拒绝导出并打印精确诊断（usageRatio + violation codes）
   - 产出写入 `local-output/`（已 gitignore）
4. **生成样例**：`scripts/gen-local-structure.ts` 产出 `local-output/structure.json`

## 真实模型评测（2026-08-12，deepseek-v4-flash 直连）

`npm run eval:resume-agent` 3/3 通过（fixture 数据 + 真实 LLM + 语义编译）：

| case | 结果 | 状态 | calls | 耗时 | tokens |
| --- | --- | --- | --- | --- | --- |
| semantic-zh | ✅ | ready_for_approval（quality 0.91，全部 req 覆盖） | 13 | 56.9s | 158k |
| semantic-en | ✅ | ready_for_approval（quality 1.0） | 10 | 34.4s | 105k |
| semantic-missing | ✅ | needs_user_decision（如实报告 must-have 缺口 + 两条出路） | 9 | 28.8s | 87k |

真实工具序列验证了编排契约：snapshot → prepare_resume_draft → 并行 write_bullet（被拒修正重发）→
inspect_resume_draft 诊断循环 → 自动 quality review → 终端状态。

**观察到的模型行为问题（后续优化点）**：
1. **bullet 普遍过短**：大量 write_bullet 因"长度 30-58 < 目标 92-165"被拒后修正，说明模型对
   "宁长勿短"执行不足，系统提示的字符目标指令需强化（或 write_bullet 支持 targetChars 必填）
2. **术语重复**：英文 case 多次因重复片段（" product "、" Python "）被拒，防呆生效但浪费轮次
3. **时序小瑕疵**：模型在 prepare_resume_draft 前先调用 inspect_resume_draft 被拒一次后纠正

**LLM 访问模式**：`createConfiguredModelDependencies` 改为——配置了 `DEEPSEEK_API_KEY` 时直连
DeepSeek（本地开发/评测），否则走 Coolto credit 网关（生产）。服务器网关验证通过（登录 ✓、
计费请求 ✓），但账号 Credit 余额不足返回 402，故评测临时用本地 key 直连。

## 真实账号端到端（2026-08-12，测试账号 + 腾讯天美 JD + 简历 PDF 导入）

CLI 完整链路跑通（直连 LLM）：

1. **PDF 导入**：`chen-jiansheng.pdf`（214KB）→ pdfjs-dist 解析 → 7 条经历候选
   （教育 2 / 实习 2 / 项目 3）→ `--auto-approve` 自动接受 → 写入经历库 ✓
2. **JD 保存**：腾讯天美 AI 应用开发实习生 JD → `prepare_jd_import` → 自动审批 ✓
3. **Agent 编排生成**：snapshot → prepare_resume_draft → 并行 write_bullet → inspect
   循环 → **layout_qualified（语义编译 usage 1.03）**，草稿导出 `local-output/cli-resume.json`
4. **真实 Chromium 导出**：`pdf:export` 拒绝——真实排版 usageRatio=0.817（<85%）+
   12 条 bullet_tail_too_short

**关键发现（语义 vs 真实编译偏差）**：CLI 语义编译（占用率只由 bullet 数量驱动）下
`layout_qualified` 的草稿，在真实 Chromium A4 排版下只有 81.7% 占用且大量尾行不达标。
结论：**语义编译只能验证编排状态机，不能验证版面质量**；真实质量的收敛必须用
Electron（真实编译）验收。这是本阶段已确认的边界，桌面端不受影响（走真实编译器）。

**CLI 测试配套新增**：
- `--auto-approve`：one-shot 模式自动接受挂起审批并续接（测试专用）
- `--prompt-file`：UTF-8 读 prompt（规避终端编码问题）
- `--dump-resume`：生成后导出 `{status, revision, usageRatio, structure}` 到 JSON
- `src/cli/cli-profile-reader.ts`：`COOLTO_TEST_FULLNAME/PHONE/CONTACT_EMAIL` 环境变量
  本地覆盖 profile（测试账号专用，生产不使用）
- `src/cli/cli-profile-proposals.ts`：CLI 降级 ProfileProposalExecutor（校验字段、
  跳过 profile 写入——后端无 profile 写接口）
- `src/api/contract-values.ts`：`nullableString/nullableNumber` 对 undefined 容忍为
  null（服务器 profile 缺字段时不再契约报错，桌面端同步受益）

## 遗留项

- **性能对比**：新 Agent 编排 vs 旧宿主规划的耗时/token 对比需真实 DeepSeek 模型跑
  `npm run eval:resume-agent` / performance session，等待用户环境提供 API key 后执行
- `npm run check` 在 Windows 上被 4 个 macOS 专属测试阻断（test 阶段 exit 1），
  build/desktop:build 已单独验证通过；macOS 环境可完整跑通
- `instructionFor` 诊断文案仍偏 patch 术语，后续可补 write_bullet 视角
- 真实 Chromium 下 Agent 编排的最终质量需 Electron 手动验收（CLI 语义编译只验证状态机）
- bullet 过短问题（见上）等待下一轮优化
