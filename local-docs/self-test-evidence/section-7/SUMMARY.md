# §7 用户偏好学习 — 自测证据（2026-10-18 Asia/Shanghai）

## 验收勾选表

| 验收项 | 现状 | 证据 |
|--------|------|------|
| 可增删停用偏好；「以后都这样」先预览再保存 | **满足**（本轮加固） | Settings → PreferenceDialog：新增/编辑 →「查看变更并确认」→「确认并保存」；建议卡「保存为偏好」亦先进 proposal；`prepare_preference_change` 仅建审批；system prompt v158 明确「以后都这样」须先预览审批；测试 `Preference create waits for approval…` / `disable, re-enable, and delete…` / `Preference approval draft is local-only…` |
| 冲突时本轮听当前消息；删除后新任务不再用 | **满足** | `resolvePreferences`：`current_turn_override` 优先；deleted/disabled 写入 `ignored`；测试 `current message override wins…` / `disabled, deleted… never apply` / `deleted preference is ignored and current-turn override wins`；prompt：当前指令 > 显式偏好 > 行为建议 |
| 抽查无密码/验证码/敏感身份 | **满足** | `assertSafePreferenceValue` + registry 禁存语义/形状；测试 `registry is allowlisted… sensitive-safe` / `rejects * in every free-list…` / `sensitive identity and auth shapes…` |

## 本轮改动（缺口补齐）

1. `src/preference/approval-draft.ts`：审批说明改为本机写入 + 开源不连 Coolto 云；`accept_server` 文案改为「已拉取副本」。
2. `src/tools/prepare-preference-change.ts`：工具描述对齐「以后都这样 / 先审批 / 临时指令不调用 / 禁敏感」。
3. `src/agent/system-prompt.ts` → `v158`：以后都这样须预览审批；删除本机标记、新任务不用；优先级与冲突规则写明。
4. UI：`PreferenceDialog` / `use-preference-dialog` / i18n / executor 去掉「同步 Worker / 等待同步 / 服务端」面向开源用户的表述。
5. 测试：`test/preference-oss-local.test.ts` + dialog UI contract + system-prompt 断言。

## 命令证据

```text
unset NPM_CONFIG_PREFIX; nvm use 22
node --import tsx --test --test-concurrency=1 \
  test/system-prompt.test.ts \
  test/preference-oss-local.test.ts \
  test/preference-dialog-ui-contract.test.ts \
  test/preference-core.test.ts \
  test/preference-resolution.test.ts \
  test/preference-app.test.ts \
  test/preference-form.test.ts \
  test/preference-signal-reader.test.ts \
  test/preference-sync-contract.test.ts
# pass 58（见 preference-unit-tests.log）
```

证据中无 `.env` / API Key 明文。

## 残留弱点

- 完整 Electron GUI 点通（设置→偏好→预览→确认）依赖本机桌面环境；本轮以单元/契约测试覆盖为主，未在无显示 box 上重跑 UI QA。
- LocalSyncStore 仍保留 `accept_server` / `reapply` 冲突路径（历史商业同步契约）；开源默认无云 Pull，该路径仅在本地 sync issue 出现时可见，文案已改为「已拉取副本」。
- 「验证码」+ 数字拼接等边缘串可能绕过语义分词（中文被当作分隔符）；纯「验证码」与邮箱/手机/Token 形状仍拦截。完整 GUI 抽查建议用真实敏感串再验一次。
