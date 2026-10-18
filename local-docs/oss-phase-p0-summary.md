# 开源 Desktop P0 阶段小结（§1–§5）

日期：2026-10-18（Asia/Shanghai）  
仓：`/workspace/coolto-desktop-local`  
范围：P0 §1–§5 已闭环；**§6 职业画像** 与 **§7 用户偏好** 已于 2026-10-18 补齐证据（见 `self-test-evidence/section-6/`、`section-7/`）；§8–§12 未开始。

## P0 达标项

| 节 | 主题 | 结论 | 关键证据 |
|----|------|------|----------|
| §1 | 投递闭环（fixture） | 既有 QA / GUI smoke 证据保留 | `self-test-evidence/section-1*` / `gui-smoke` |
| §2 | 简历主路径（有 Key 样本门） | 既有 BYO LLM / eval 相关提交保留 | `section-2` / 前期 commits |
| §3 | 本机可观测性 | **达标**：`events.jsonl` 已接线核心 agent 动作；文档与单测更新 | `section-3/` |
| §4 | 本机隐私与数据控制 | **达标**：UI 本机导出/清除；夹具对账 manifest counts↔资产种类；敏感字段拒绝 | `section-4/` |
| §5 | 跨平台安装与更新 | **部分达标**：Linux AppImage builder 成功；README 含 Win/mac/Linux 源码路径 | `section-5/` |

### §3 已写入 `events.jsonl` 的动作

`app_start` · `experience_import` · `jd_import` · `match_analysis` · `resume_generation` · `resume_export` · `managed_task` · `data_export` · `data_clear`

实现入口：`src/diagnostics/` + 各 executor / trace / agent-task runner。

### §4 导出对账（夹具）

- UI 可见种类：`experience` / `jd` / `resume` / `application` + local conversations/drafts/tasks  
- `manifest.body.counts` 与 `entries` 对齐；`relationshipCount` 保留  
- 禁止字段（`api_key` 等）仍触发「禁止字段」；证据无密钥明文

### §5 Linux 打包

- 脚本：`npm run package:linux`  
- 产物：`dist-electron/Coolto-*-x86_64.AppImage`、`linux-unpacked/`  
- builder EXIT 0

## 残留弱点

1. **Linux 正式包 GUI 冷启动**：box 无 keyring / 无 Linux `coolto-core` 原生保护哈希时，unpacked 启动会报安全模块/密钥环错误；开发路径仍用 `desktop:dev`。  
2. **托管任务诊断粒度**：`managed_task` 依赖 `changed` 回调与授权 executor；极短失败路径若未触发 `changed` 可能漏记（主路径已覆盖）。  
3. **导出对账为夹具级**：未在本轮跑完整 Electron GUI「点导出」实机包（对话框依赖人工）；逻辑与脱敏由 `DataExportService` + reconciliation 测试覆盖。

## Deferred（下阶段 / 真机）

| 项 | 说明 |
|----|------|
| Win / Mac 真机打包与安装 | `package:win` / `package:mac*`；需对应 OS |
| Authenticode / Apple 公证 | 商业门槛；开源可选 |
| 远程仓同步 / 开 PR | 本阶段明确 **不 push、不开 PR** |
| §6 职业画像 | **可勾选**；证据 `section-6/SUMMARY.md` |
| §7 用户偏好 | **达标**（本机增删停用 + 预览确认 + 当前指令优先 + 敏感禁存）；见 `section-7/` |
| §8–§12 | **未开始**；等指令 |

## 本轮提交主题（预期）

1. feat(oss): wire agent actions into local diagnostics events.jsonl  
2. test(oss): export package reconciliation fixture (§4)  
3. chore(oss): Linux package:linux smoke + §3–§5 evidence + P0 summary  

（以实际 `git log` hashes 为准。）
