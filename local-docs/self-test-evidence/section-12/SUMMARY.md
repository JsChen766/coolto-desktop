# §12 Agent 上下文与工具收敛 — 自测证据（2026-10-18 Asia/Shanghai）

## 验收勾选表

| 验收项 | 现状 | 证据 |
|--------|------|------|
| 简历任务不可见无关的最终投递/邮件发送等工具（工具清单矩阵） | **满足** | `toolsForConversationRun` 在 `discovery`/`resume` 均屏蔽 `prepare_application_submission` / `browser_submit` / 回执同步 / `list_mail_connections` / inbox 读写与提案等；保留经历/简历/匹配/选中附件等；契约 `§12 matrix: resume and discovery hide final delivery / mail tools` |
| 阶段切换工具范围变化可说明/可测 | **满足** | `createDefaultStagePolicy`：`observe` 仅读 scopes；`approved_action` 含 `browser.write`；`evaluateDelegationPolicy` 在 observe 对写入返回 `stage_scope_not_granted`，有 transition 后 allow；既有 `stage-policy.test.ts` + `§12 stage switch…` |
| 重启恢复要求重读过期页面/文件/工作区 | **满足**（本轮补齐选中附件） | 浏览器结果 / 简历工作区 / 投递文件早已 transient；本轮将 `list_selected_files` / `parse_selected_file` 纳入 `persistence-policy`，过期指令要求重挂附件或再 list；`§12 restart: page / file / workspace…` |
| 不新建第二套业务 Agent 或绕过 Proposal/审批 | **满足** | `get_runtime_info` → `architecture=single-agent`、`cloudLangGraphUsed=false`；README「只有一个 Agent」「执行器不出现在模型 Tool List」；`registry.ts` 不装配 `ActionExecutorRegistry` / save/import/submission executors；prepare 工具源码均含 approval |

## 本轮改动（缺口补齐）

1. `src/agent/persistence-policy.ts`：选中附件 `list_selected_files` / `parse_selected_file` 持久化时过期，禁止复用 stale `fileId`。
2. `test/oss-section-12-agent-context.test.ts`：§12 四条验收矩阵（工具可见性、阶段、过期句柄、单 Agent/审批边界）。

## 命令证据

```text
unset NPM_CONFIG_PREFIX; nvm use 22
node --import tsx --test --test-concurrency=1 \
  test/oss-section-12-agent-context.test.ts \
  test/conversation-tool-scope.test.ts \
  test/agent-persistence-policy.test.ts \
  test/stage-policy.test.ts \
  test/tool-registry.test.ts
# pass 39 / fail 0（见 agent-context-unit-tests.log）
```

证据中无 `.env` / API Key 明文。未 push。

## §8 / §11 判定（本轮不扩做）

| 节 | 结论 | 依据（README 原句 / PRD） |
|----|------|---------------------------|
| §8 面试训练 | **deferred** | PRD：「开源首期不作为主路径阻断」「验收（仅当宣称支持时）」。README **未宣称**「面试训练 / 模拟面试」能力；仅有投递追踪实体与日历/briefing：「Interview、Note、Reminder 归属 Application」「可授权周期性循环：…或面试 briefing」「macOS 可在用户确认后把面试写入系统日历」。这些不是文本模拟面试训练。 |
| §11 浏览器站点记忆 | **deferred** | PRD：「P2，增强」「验收（宣称支持时）」。README **未宣称**「站点记忆 / 字段级自动记忆策略」；宣称的是「招聘表单填写、Answer Vault、提交回执与 Application Proposal 均走审批」。Answer Vault 是用户确认的常用求职事实库，不是 §11 的站点字段映射记忆。`local-docs/browser-autofill-roadmap/` 为历史路线，非当前能力宣称。 |

## 残留弱点

- 普通对话在无托管任务时固定 `discovery` 上下文（与 `resume` 屏蔽集相同）；未按「是否有简历工作区」切换 context 标签，行为已满足投递/邮件工具不可见。
- 完整 Electron GUI 下「阶段切换后模型可见工具列表」依赖本机桌面；本轮以单元/策略契约覆盖。
- `mail.send` 本就不能授权（提案层抛错）；开源主路径仍不把邮箱发送写成必达。
