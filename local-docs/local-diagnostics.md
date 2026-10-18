# 本机可观测性（开源 Desktop）

对齐开源 PRD §3：贡献者可在**本机**诊断主链路；不连接 Coolto 云埋点后台。

## 如何打开诊断

1. **开发者工具（推荐）**  
   `npm run desktop:dev` 启动的未打包窗口启用 DevTools（`webPreferences.devTools: !app.isPackaged`）。在 Electron 菜单或快捷键打开 Console / Network，观察渲染层错误与 IPC 失败。

2. **CDP 远程调试**  
   ```bash
   npm run desktop:dev:cdp
   # 默认 http://127.0.0.1:9222
   ```
   用于 `smoke:desktop-chat` 等自动化；勿在日志里粘贴 Key。

3. **本机诊断事件日志（JSONL）**  
   启动后主进程会写入（若已配置 `userData`）：
   - 目录：`<userData>/diagnostics/`
   - 文件：`events.jsonl`
   - Linux 开发常见路径：`~/.config/Coolto/diagnostics/events.jsonl`（以本机 Electron `app.getPath("userData")` 为准）
   - 每行一条 metadata 事件：`action` / `phase` / `detail`（**不含**简历/经历正文、API Key、绝对路径）

4. **简历生成 trace（metadata-only）**  
   `ResumeGenerationTraceStore` 记录生成阶段/工具成败；`src/resume/performance/telemetry-safety.ts` 断言禁止正文类字段。对话侧可通过主进程 `generationTrace(conversationId)` 读取最近一次摘要。

5. **Agent 任务与审批时间线**  
   侧栏 **Agent 任务** 与对话内工具/审批卡片可重建「任务阶段 → 等待用户 → 成功/失败」；托管任务的环境事件与 Action Ledger 留在本机 harness 状态中。

## 重建「经历 → JD → 简历 →（可选）投递」时间线

| 步骤 | 本机入口 | 诊断线索 |
|------|----------|----------|
| 启动 | `desktop:dev` 终端 + `events.jsonl` 的 `app_start` | phase=`success` |
| 导入经历 | 审批导入 / 材料沉淀 | `experience_import`（success / failure / cancelled） |
| 导入 JD | `prepare_jd_import` 审批通过 | `jd_import` success；拒绝为 cancelled |
| 匹配 | `prepare_match_analysis` → MatchReport | `match_analysis` success |
| 生成简历 | 简历工作区 / 预览 | Resume trace + `resume_generation` success/failure |
| 导出简历 PDF | PDF 导出审批 | `resume_export` success/cancelled |
| 导出 / 清除 | 设置 → 隐私与数据 | `data_export` / `data_clear` |
| 托管任务 | Agent 任务授权与运行 | `managed_task`（started / waiting_user / success / failure / cancelled） |

## 最小数据原则

- 默认日志与诊断 **不得** 含：简历正文、经历正文、API Key、密码、验证码、绝对隐私路径明文。
- 贡献前自检：见 [`CONTRIBUTING.md`](../CONTRIBUTING.md) 安全审核；单测 `test/local-diagnostics.test.ts`、`test/resume-performance.test.ts`（telemetry-safety）。
- 证据与 Issue 粘贴前打码 Key；`.env` 永不入库。

## 相关路径

- `src/diagnostics/` — 本机事件环与脱敏
- `src/resume/performance/telemetry-safety.ts` — 简历 trace 安全断言
- `local-docs/oss-gui-self-test.md` — GUI 自测与 CDP
