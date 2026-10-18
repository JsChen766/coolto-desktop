# §3 本机可观测性 — 自测证据（2026-10-18 Asia/Shanghai）

## 验收项对照

| 验收项 | 现状 | 本轮改动 |
|--------|------|----------|
| CONTRIBUTING / docs 说明如何打开本机诊断 | `CONTRIBUTING.md` §本机可观测性 + `local-docs/local-diagnostics.md` | 是（新增文档） |
| 能重建经历→JD→简历→投递时间线 | 文档表格 + Agent 任务/审批 UI + Resume trace + `events.jsonl` | 是（文档 + `src/diagnostics/`） |
| 默认日志无密钥与正文 | `sanitize.ts` + `telemetry-safety.ts` + 单测 | 是（脱敏模块与测试） |

## 命令证据

```text
node --import tsx --test test/local-diagnostics.test.ts
# pass 2
node scripts/check-source-lines.mjs
# Source policy passed
```

详见同目录 `local-diagnostics-test.log`。
