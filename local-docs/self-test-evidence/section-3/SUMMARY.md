# §3 本机可观测性 — 自测证据（2026-10-18 Asia/Shanghai）

## 验收项对照

| 验收项 | 现状 | 本轮改动 |
|--------|------|----------|
| CONTRIBUTING / docs 说明如何打开本机诊断 | `CONTRIBUTING.md` + `local-docs/local-diagnostics.md` | 是（时间线表补齐已接线 action） |
| 能重建经历→JD→简历→投递时间线 | `events.jsonl` 现写入：`app_start` / `experience_import` / `jd_import` / `match_analysis` / `resume_generation` / `resume_export` / `managed_task` / `data_export` / `data_clear` | 是（补齐 agent 动作 call sites） |
| 默认日志无密钥与正文 | `sanitize.ts` + `record-product-action.ts` + 单测 | 是 |

## 接线路径

- `src/diagnostics/record-product-action.ts` — 统一 metadata 写入
- `src/actions/experience-import-executor.ts` / `experience-material-committer.ts` → `experience_import`
- `src/jd/jd-save-executor.ts` → `jd_import`
- `src/match/report-store.ts` → `match_analysis`
- `src/resume/performance/generation-trace-store.ts` → `resume_generation`
- `src/resume/export/export-executor.ts` → `resume_export`
- `agent-task-approval-executor` + `create-agent-task-runner` → `managed_task`

## 命令证据

```text
node --import tsx --test --test-concurrency=1 test/local-diagnostics.test.ts
# pass 3
node scripts/check-source-lines.mjs
# Source policy passed
```

详见同目录 `local-diagnostics-test.log`。
