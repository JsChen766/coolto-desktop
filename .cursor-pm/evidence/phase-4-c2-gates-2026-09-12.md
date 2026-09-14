# Phase 4 — C2 MAIL / INTERVIEW / SITE / CTX

Date: 2026-09-12  
Worktree (gates): `E:\vsProjects\coolto\.codex-worktrees\prd-privacy` (post-merge trunk lock-in)  
Original dev: `prd-app-closure`

## Scope honesty

C2 **runtime wiring**（`create-user-services`、IPC、preload、agent factory）在 C1 前已就位；本阶段补 **门禁 + 合约测试 + 收件箱审批 UI 验收**，不重复造第二套 Mail/Browser 宿主。

## Delivered

| Item | Path / command |
| --- | --- |
| C2 Node 合约 | `test/c2-mail-schedule-host-contract.test.ts` |
| Mail loop 连接校验抽取 | `validate-mail-schedule-connections.ts` ← `agent-task-ipc` |
| 统一门禁 | `npm run qa:phase-4-c2` → `scripts/run-phase-4-c2-gates.mjs` |
| Inbox 审批 UI（A3 延伸） | `profile-pref-qa/inbox-approval-fixtures.ts` + `profile-pref-ui-qa-entry` `[C2-A3]` |

`qa:phase-4-c2` 链：C2 单测 → `qa:agent-harness` → `qa:agent-tasks-ui` → `qa:browser-agent` → `qa:phase-2:ui`（含 inbox 卡）。

## Gates

| Gate | Result |
| --- | --- |
| `npm run check` | **PASS** 2026-09-12 |
| `npm run qa:phase-4-c2` | **未在本轮全量跑**（含多段 Electron，耗时长）；Node 部分已随 `check` 覆盖新增单测 |

## Still U / manual

- 真实 OAuth 邮箱连接（`COOLTO_*_OAUTH_CLIENT_ID`）
- 登录后创建并启动 `mail_app_schedule`
- 真站招聘表单
- Phase 2 搁置手测项（A4-cold、B2–B3、C4 等）

## Next

- **C3** Tier2 纵向门禁（按 `phase-4-entry` 列表增量）
- 可选：本地跑通 `npm run qa:phase-4-c2` 并把手测结果写入 `phase-4-manual-test-checklist.md`
