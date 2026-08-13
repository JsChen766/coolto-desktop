# S0 CLI 基础设施

> 状态：已完成
> 完成日期：2026-08-12

## 目标

CLI（`src/cli/main.ts`）补齐简历生成自测能力：生成工具链注册、语义编译、PDF 导出、输出目录约定。

## 交付物

| 文件 | 职责 |
| --- | --- |
| `src/cli/semantic-compiler.ts` | `CliSemanticCompiler`：无 Electron 环境下的语义编译（占用率由 bullet 数量驱动），支撑 Agent 编排状态机端到端自测 |
| `src/cli/pdf-export-entry.ts` | Electron headless 入口：编译校验 → printToPDF → 写盘 `local-output/`；未达标拒绝导出并打印精确诊断 |
| `src/cli/args.ts` | 新增 `--dump-resume <path>`（生成后导出 structure JSON）与 `--prompt-file <path>`（UTF-8 读 prompt，规避终端编码问题） |
| `scripts/gen-local-structure.ts` | 生成 `local-output/structure.json` 样例（复用 qualified fixture） |
| `package.json` `pdf:export` 脚本 | esbuild bundle → `out/cli/pdf-export-entry.cjs` → electron 运行 |
| `local-output/` + `.gitignore` | 测试产物目录（`/local-output` 已忽略，PDF/JSON 一律写入该目录） |

## 真实生成自测流程（服务器 LLM）

```bash
# 1. 交互登录一次（OTP 邮箱验证码，session 存钥匙串）
npm run dev

# 2. 非交互真实生成（服务器 LLM 网关 credit.coolto.com.cn + 真实账号资产 hkapi.coolto.com.cn）
npm run dev -- --prompt-file local-output/generate-prompt.txt --dump-resume local-output/cli-resume.json

# 3. 导出 PDF（Electron headless，真实 Chromium 编译 + printToPDF）
npm run pdf:export -- --structure local-output/cli-resume.json --out local-output/cli-resume.pdf
```

`--dump-resume` 产物为 `{status, revision, usageRatio, structure}`，可直接作为 `pdf:export` 输入。

## 验证证据

- `npm run pdf:export -- --structure local-output/structure.json --out local-output/demo-resume.pdf`
  端到端成功：`%PDF-1.4` 文件头验证，480KB
- 未达标结构触发拒绝并打印 `usageRatio + violation codes`（验证防呆生效）
- `src/cli/main.ts` 已注册 `agentOrchestrated` 生成工具链（CliSemanticCompiler + store）

## 说明

- PDF 导出依赖 `npm run desktop:build` 产物（out/preload、out/renderer），首次运行自动构建
- 真实像素排版由 Electron 手动验收覆盖；CLI 语义编译只验证编排行为
