# §6 职业画像 — 自测证据（2026-10-18 Asia/Shanghai）

## 验收勾选表

| 验收项 | 现状 | 证据 |
|--------|------|------|
| 设置页可编辑核心画像字段；可跳过仍能用基础功能 | **满足** | Settings →「个人档案」→ `ProfileDialog`（联系方式 / 求职目标 / 语言风格）；`ensureLocalEmptyProfile` 空档案可读取；测试 `OSS empty Profile seed keeps contact fields null…` |
| 对话提议改档案必须确认；临时指令不静默永久写入 | **满足**（本轮加固） | `prepare_profile_update` 仅建审批，接受后才写入；system prompt v157 明确「临时指令只对本轮」+「空字段禁止臆造」；审批文案改为本机写入（无 Coolto 云同步协议表述） |
| 本机多用户/多工作区隔离（若支持多 profile）：无串数据 | **满足** | Profile 按 `ownerId` 投影；`Profile conflict reapply … isolates account projections`（user-a 写入不影响 user-b） |

## 本轮改动（缺口补齐）

1. `src/profile/approval-draft.ts`：审批说明改为本机写入，去掉「Coolto 同步协议」。
2. `src/agent/system-prompt.ts` → `v157`：空字段不臆造；临时称呼/城市/目标不得静默永久写入 Profile。
3. `src/tools/prepare-profile-update.ts`：工具描述对齐「仅长期 Profile / 禁止臆造空字段 / 临时指令不调用」。
4. 测试：审批本机文案、部分字段不发明其它字段、空 Profile seed。

## 命令证据

```text
unset NPM_CONFIG_PREFIX; nvm use 22
node --import tsx --test --test-concurrency=1 \
  test/system-prompt.test.ts \
  test/prepare-profile-update-tool.test.ts \
  test/profile-proposal-service.test.ts \
  test/profile-form.test.ts \
  test/profile-dialog-controller.test.ts \
  test/profile-career-targets.test.ts \
  test/profile-sync-contract.test.ts \
  test/profile-sync-roundtrip.test.ts \
  test/cli-profile-writer.test.ts
# pass 58 + 16（见 profile-unit-tests.log）
```

证据中无 `.env` / API Key 明文。

## 残留弱点

- 完整 Electron GUI 点通（设置→编辑→保存）依赖本机桌面环境；本轮以单元测试 + 既有 `qa:phase-2:ui` 脚本覆盖为主，未在无显示 box 上重跑 UI QA。
- OSS 默认单本地 identity；多 profile 隔离以 `ownerId` 契约测试为准，非多账号 GUI 切换验收。
