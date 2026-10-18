# 开源 Desktop P1 阶段小结（§6 / §7 / §9 / §10 / §12）

日期：2026-10-18（Asia/Shanghai）  
仓：`/workspace/coolto-desktop-local`  
基线 HEAD（写本小结前）：`0a3e2fc`（`feat(oss): harden agent context tool convergence §12`）  
交叉引用：P0 §1–§5 见 [`oss-phase-p0-summary.md`](./oss-phase-p0-summary.md)。

范围：P1 宣称节 **§6 / §7 / §9 / §10 / §12** 已闭环并落证据；**§8 面试训练**、**§11 浏览器站点记忆** 为 **deferred**（README 未宣称，见下）。本阶段 **不 push**。

## P1 已完成

| 节 | 主题 | 关键 commit | 证据目录 |
|----|------|-------------|----------|
| §6 | 职业画像（本机确认路径） | `1cdedc6` | `self-test-evidence/section-6/` |
| §7 | 用户偏好（本机增删停用 + 预览确认） | `fdcef39` | `self-test-evidence/section-7/` |
| §9 | 匹配分数可信（可解释、非录用概率） | `9356465` | `self-test-evidence/section-9/` |
| §10 | 本机材料库验收加固 | `33adcb0` | `self-test-evidence/section-10/` |
| §12 | Agent 上下文与工具收敛 | `0a3e2fc` | `self-test-evidence/section-12/` |

各节 `SUMMARY.md` 含验收勾选、命令证据与节内残留弱点；日志见同目录 `*-unit-tests.log`。

### §6 要点

- `prepare_profile_update` 仅建审批；接受后才本机写入；临时指令不静默永久写 Profile。
- 审批文案本机化（无 Coolto 云同步协议表述）；空字段禁止臆造。
- 多用户隔离以 `ownerId` 契约测试为准。

### §7 要点

- 「以后都这样」须预览再保存；`current_turn_override` 优先于持久偏好。
- 敏感值禁存（密码/验证码/身份形状等）；开源 UI 去掉面向云同步的表述。

### §9 要点

- UI 明确「相对参考，非录用概率」；亮点/缺口可回到 JD 要求与经历证据。
- 宿主重算覆盖率/证据完整度，低证据降展示精度并标置信；`scorerVersion=1.1`。

### §10 要点

- 支持格式上传与处理状态；材料↔Experience 可查；删除前有影响预览。
- OCR 低置信需确认；`delivery_resume` 无材料授权时不解析入库。

### §12 要点

- `discovery` / `resume` 屏蔽最终投递与邮件发送等工具；阶段策略可测。
- 过期页面/文件/工作区/选中附件须重读；单 Agent、不绕过 Proposal/审批。

## Deferred（README 未宣称）

| 节 | 说明 | 依据 |
|----|------|------|
| §8 面试训练 | **deferred** | PRD 开源首期非主路径阻断；README 未宣称「面试训练 / 模拟面试」（仅有 Interview 实体、briefing、日历写入）。详 `section-12/SUMMARY.md`。 |
| §11 浏览器站点记忆 | **deferred** | PRD 标 P2 增强；README 未宣称站点字段级记忆（Answer Vault ≠ §11）。详 `section-12/SUMMARY.md`。 |

## 与 P0 的关系

- P0（[`oss-phase-p0-summary.md`](./oss-phase-p0-summary.md)）闭环 §1–§5（可观测性、隐私导出、安装路径等）。
- P0 小结曾将 §6/§7/§9/§10/§12 标为可勾选并指向证据目录；本 P1 小结以独立提交把上述五节收束为 **P1 已完成**，并明确 §8/§11 仍 deferred。
- P0 残留（Linux 正式包 GUI 冷启动、托管任务诊断粒度、导出对账夹具级）仍成立；见该文件「残留弱点」。

## 残留共性弱点

1. **无显示 box 完整 GUI 点通**：§6/§7/§9/§10/§12 均以单元/契约测试为主；设置→编辑/偏好、匹配卡侧栏、材料库上传→OCR、阶段切换后工具可见性等，未在无桌面 box 上重跑完整 Electron UI QA。
2. **Linux 正式包 GUI 冷启动**（承 P0）：无 keyring / 无 Linux `coolto-core` 原生保护哈希时 unpacked 启动受限；开发路径仍用 `desktop:dev`。
3. **节内已知边角**（不全列）：§7 敏感分词边缘串；§9 宿主未逐字校验 `sourceQuote`；§10 关联经历仅 ID、无深链；§12 无托管任务时固定 `discovery` 上下文标签。细节见各 `section-*/SUMMARY.md`。

## 下一步候选（仅列出，不执行）

发布清单候选：

1. README 终检（能力宣称与 deferred 一致；无超额承诺 §8/§11）
2. 敏感清理（`.env` / 密钥 / 证据与日志抽查无明文）
3. 远程仓就绪（分支整理、是否 push / 开 PR — **本阶段明确不做**）

## 本轮提交

- `docs(oss): add P1 phase summary`（本文件）

（以实际 `git log` hash 为准；父提交应为 `0a3e2fc`。）
