# 无 Key 门禁自测结果摘要

- **时间**：2026-10-18 20:25–20:27 Asia/Shanghai (CST, UTC+8)
- **仓路径**：`/workspace/coolto-desktop-local`
- **分支**：`dev/app-complete`（基线文档 commit `17f1af9`）
- **Node**：系统原为 `v20.19.2`（不满足 `engines.node >=22.13.0`）；经 nvm 安装并使用 **`v22.23.3`**（npm `10.9.9`）后执行
- **密钥**：未读取/写入真实 API Key；本摘要与同目录日志已核对无 Key / Bearer / cookie

## 总览

| 步骤 | 命令 | 结果 | 备注 |
|------|------|------|------|
| 依赖安装 | `npm install` | **通过** | 578 packages；有既有 audit 告警，未当作门禁失败 |
| 桌面类型检查 | `npm run desktop:typecheck` | **通过** | exit 0 |
| Node 类型检查 | `npm run typecheck` | **失败** | exit 2；见下 |
| 单测 | `npm test` | **失败** | 1542 tests，**1537 pass / 5 fail**；见下 |
| 简历模板检查 | `npm run check:resume-template` | **通过** | exit 0 |
| 源文件行数 | `npm run check:source-lines` | **通过** | 1405 files ≤250 lines |
| Fixture QA | `npm run qa:browser-agent` | **通过** | suite `bsf3-v1`，**passed: 36**；Electron 43.2.0 / linux |
| 全量 `npm run check` | （未整跑） | — | 含 `build` + `desktop:build`；已分别跑上述门禁 + fixture QA（`qa:browser-agent` 内部已 `desktop:build`） |

**结论**：无 Key 门禁**未全部通过**——`typecheck` 与 `npm test` 失败（不得标为通过）。Fixture QA `qa:browser-agent` 与 `desktop:typecheck` 通过。未阻塞于浏览器依赖；曾阻塞于系统 Node 版本，已用 nvm 解决。

## 失败明细（如实记录）

### `npm run typecheck`（exit 2）

见 [`typecheck.log`](./typecheck.log)：

1. `test/support/qa-pdf-seed-fixture.ts(43,5)`：TS2554 Expected 1 arguments, but got 2
2. 同文件 `(68,9)`：TS2375 `ResumeWorkspace` / `exactOptionalPropertyTypes` — `lineBudgetVersion` 为 `undefined` 不可赋给 `"item-lines-v1"`

### `npm test`（exit 1；5 fail）

完整 TAP 较大，失败摘录见 [`npm-test-failures.log`](./npm-test-failures.log)：

1. `[C4-known] Library toolbar filters still use native select (documented exception)` — `test/phase-2-checklist-automation.test.ts`（期望 `/<select\b/`）
2. `leftover PRD surfaces expose disclosure, JD analyze, URL paste, and interview prep` — `test/prd-leftover-gaps.test.ts`（期望 `/发送后会把当前对话/`）
3. `accepted behavior suggestions are consumed durably and stay consumed after restart` — `test/preference-app.test.ts`（`Preference suggestion 不存在或已经被消费`）
4. `suggestion-bound preference approval consumes the suggestion with the local enqueue` — 同上
5. `accepted suggestion orphan is reconciled after enqueue and rollback persistence failures` — 同上

## 通过命令摘录

```text
npm install                                          # OK
npm run desktop:typecheck                            # EXIT:0
npm run check:resume-template                        # EXIT:0
npm run check:source-lines                           # EXIT:0
npm run qa:browser-agent                             # EXIT:0; passed: 36
```

## 环境说明

- **未 push、未开 PR**
- 未猜测或注入任何 API Key
- `qa:browser-agent` 日志中有 Chromium/dbus 噪音（无显示总线），未影响 suite 结果
