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

## 修复后重跑（2026-10-18 20:30–20:31 Asia/Shanghai）

- **Node**：nvm `v22.23.3`
- **基线 HEAD（修前）**：`850545a`
- **密钥**：仍未读取/写入真实 API Key

### 根因与修复（小范围）

| 失败 | 根因 | 修复 |
|------|------|------|
| `typecheck` TS2554 | `ResumePdfCompiler.compile` 仅接受 1 参，fixture 仍传 fixtureId | `compiler.compile(structure)` |
| `typecheck` TS2375 | `exactOptionalPropertyTypes` 下不可把 `undefined` 赋给可选 `lineBudgetVersion` 等 | 从 `ready` 解构省略这些键再展开 |
| C4 select | 材料库已改为自定义 `MaterialLibraryStatusFilter`，不再含 `<select>`；简历库仍保留原生 select | 更新断言：材料无 select + 自定义 filter；简历仍有 select |
| PRD leftover disclosure | Composer 免责声明已在隐私拆分中移除；披露文案在 `PrivacyDataSection` | 测 Composer send 控件 + Privacy「发送给模型前/当前对话」 |
| 3× preference-app | fixture `expiresAt: 2026-10-01` 早于墙钟；`pruneAgentHarnessState(Date.now())` 在 save 时删掉 suggestion | `expiresAt` → `2099-01-01T00:00:00.000Z` |

### 重跑结果

| 步骤 | 命令 | 结果 |
|------|------|------|
| Node 类型检查 | `npm run typecheck` | **通过**（exit 0） |
| 桌面类型检查 | `npm run desktop:typecheck` | **通过**（exit 0） |
| 单测 | `npm test` | **通过**：1542 pass / **0 fail**（~16.7s） |

摘录见 [`typecheck-rerun-2026-10-18.log`](./typecheck-rerun-2026-10-18.log)、[`desktop-typecheck-rerun-2026-10-18.log`](./desktop-typecheck-rerun-2026-10-18.log)、[`npm-test-rerun-summary-2026-10-18.log`](./npm-test-rerun-summary-2026-10-18.log)。

**结论（重跑）**：无 Key 门禁中先前失败的 `typecheck` 与 `npm test` 已通过；`desktop:typecheck` 仍绿。未 push。
