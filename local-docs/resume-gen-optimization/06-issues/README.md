# 06 问题跟踪（known issues）

> 状态：持续维护
> 创建日期：2026-08-12
> 最近更新：2026-08-13
> 来源：S1-S4 实施与验收中发现的全部问题；按严重度排序，每条含证据、状态与解决方向。

## A. 版面质量（核心，优先级最高）

### A1. 语义编译与真实 Chromium 编译系统性偏差

- **证据**：同一份 CLI 生成草稿，语义编译 `layout_qualified`（usageRatio 1.03）；真实
  Chromium A4 排版仅 **0.817**，且 12 条 `bullet_tail_too_short`。
- **状态**：**已解决**（2026-08-12，随 D3 重写）
- **解决方式**：`CliSemanticCompiler` 按像素宽度估算（CJK=13px、半宽=7px，行宽 690px、
  行高 15.34、可用 1054px；固定行 = 2 + sections + items×2）。校准样本判定一致：
  - verified 合格 fixture：语义 0.873 合格 ✓（真实合格）
  - 真实生成草稿：语义 0.757/11 尾行 vs 真实 0.817/12 尾行——均判 underfilled ✓
  - 单测：`test/cli-semantic-compiler.test.ts` 3/3

### A2. 真实编译下 `inspect_resume_draft` 后模型的收敛行为未知

- **状态**：**已解决**（2026-08-12，方案 A 落地）
- **结论（实测）**：
  1. 内容生成阶段收敛良好：continuation 注入下 usage 0.32 → 0.90
  2. 像素级尾行修复不可靠：模型陷入思考死循环（"让我追加…"复读不行动）
  3. 预算兜底生效：耗尽 → `needs_user_decision`，不再无限跑
- **解决（方案 A）**：`inspect_resume_draft` 编译后由宿主自动执行 `tryTailFill`
  （确定性机械尾行补长：按 shortByChars 精确补、回滚保护、零模型成本），模型不再需要
  尾行像素心算；工具描述与系统提示同步声明"尾行由宿主自动机械修复"。
  单测：`inspect_resume_draft auto-repairs tail-short bullets host-side`。
- **边界**：tryTailFill 每轮最多修 2 条 bullet（MAX_TAIL_FILL_OPERATIONS），补长引入更差
  violation 会整体回滚；不足部分仍由模型 write_bullet 补充内容。

### A3（新增）. CLI 缺 patch 工具导致模型找不到补长工具

- **证据**：CLI registry 未注册 `patch_resume_candidate`，模型按系统提示找工具找不到，
  原地空转（usage 停在 0.32 一版）。
- **状态**：**已解决**（CLI 补齐 patcher/reviewer/repairer 注册）
- **教训**：CLI 工具注册必须与桌面端对齐，否则模型按提示找不到工具会空转。

## B. 模型行为

### B1. bullet 普遍过短，被拒后重写浪费大量轮次

- **证据**：eval 中十余次 `长度 30-58 < 目标 92-165` 拒绝后重发；semantic-zh 13 次
  模型调用中大半用于重写。
- **状态**：**已解决**（2026-08-13）
- **解决方式**：
  1. `write_bullet.targetChars` 未传时宿主给默认目标（中文 92-165、英文 160-310）
  2. 系统提示强化"宁长勿短，尽量接近长度上限，过短会被拒绝重写"
  3. 校验顺序调整：证据归属/唯一 → 数字（红线）→ 长度 → 跨 bullet 重复，
     模型先收到最基础的错误信息
- **验证**：`test/agent-orchestrated-tools.test.ts` 覆盖中文/英文默认目标（92–165 /
  160–310）及“证据归属 → 数字 → 长度”的拒绝优先级；定向 15/15 通过。

### B2. 跨 bullet 术语重复被拒过严

- **证据**：英文 case 多次因 `" product "`、`" Python "`、`"s and product "` 被拒
  （含 skills 区与 work bullet 撞词场景）。
- **状态**：**已解决**（2026-08-13）
- **解决方式**：跨 bullet 重复检测**先剥离各 bullet 引用的证据原文**，只对模型自写
  措辞判重——两条 bullet 引用同一经历的相邻证据时不再必然死锁。拒绝消息补充
  "若该经历证据已用完，请停止填充并进入审查"。
- **观察项（保留现状）**：跨经历同措辞重复仍被拒（符合专业排版预期，不调整）。
- **验证**：`test/agent-orchestrated-tools.test.ts` 覆盖共享证据原文不触发重复，以及
  跨经历重复模型措辞仍拒绝；定向 15/15 通过。

### B3. 模型时序小瑕疵

- **证据**：先 `inspect_resume_draft` 后 `prepare_resume_draft` 被拒一次；达到
  `layout_qualified` 后仍在内部纠结教育区空 bullet 多轮（thinking 内耗）。
- **状态**：**已解决**（2026-08-13，系统提示补充）
- **解决方式**：inspect 条目加“若返回'请先调用 prepare_resume_draft'，立即先创建草稿
  再查看”；layout_qualified 条目加“立即停止写作，不必再纠结个别未覆盖的次要项”。
- **验证**：`test/system-prompt.test.ts` 断言上述时序指令及 `layout_qualified` 后立即
  停止写作；定向 15/15 通过。

**B 部分全量门禁现状（2026-08-13）**：B 定向测试已通过；当前 Windows 环境的完整
`npm test` 另有 4 个 macOS/POSIX 路径相关失败（`atomic-pdf-writer` 2 个、
`update-installer` 2 个），与 B 无关。`npm run typecheck` 仍被
`test/cli-profile-writer.test.ts` 的 CLI profile mock 签名不匹配阻断；本次未修改该 C2
相关文件，不能据此宣称仓库全量门禁已通过。

## C. 契约 / 服务器

### C1. 服务器 profile 可空字段缺失触发契约报错

- **证据**：`profile.contactEmail` 缺失（undefined）→ `nullableString` 抛
  `ApiContractError`，模型在"第一次返回"上死循环。
- **状态**：**已解决**（2026-08-12：`nullableString/nullableNumber` 对 undefined 容忍
  为 null，桌面端同步受益）
- **验证**：`test/coolto-api-client.test.ts`、`test/experience-api-history.test.ts` 通过。

### C2. 后端无 profile 写接口

- **证据**：API 仅有 `GET /v1/users/me/profile`，CLI 无法导入/更新个人资料；
  CLI 降级为跳过 profile 写入（`cli-profile-proposals.ts`），姓名/电话只能 env 覆盖。
- **状态**：**已解决**（2026-08-12）
- **关键修正**：后端实际支持 profile 写——走**通用同步协议**
  `POST /v1/sync/push`（`entityType: "user_profile"`、`action: "update"`），与桌面端
  同一通道；`/v1/users/me/profile` 只是只读视图。
- **解决方式**：
  - `src/cli/cli-profile-writer.ts`：`pushProfileUpdate` 复用 `SyncApi.push` +
    `toProfileWritePayload`（桌面端映射复用），`cliDeviceId()` 持久化设备身份
    （`~/.coolto-cli/device-id`）
  - `cli-profile-proposals.ts` 升级为真实写入（prepareImport 校验 → execute push）
  - `prepare_profile_update` Agent 工具（2026-08-13）：用户给出资料后只创建
    `profile.update` 审批；接受审批时才调用 proposal executor 写入。CLI 审批输出会逐项显示
    当前值与新值，避免盲确认。
  - 恢复登录时，CLI profile push 复用 `/v1/users/me` 返回的 Session `deviceId`；此前错误地
    使用了本地文件的旧 deviceId，导致服务端拒绝为 `device_mismatch`。Session 未提供 deviceId
    时拒绝本次 profile 写入而非回退到旧 ID。
  - `cli-profile-reader.ts`（env 覆盖）已退役，`.env` 的 `COOLTO_TEST_*` 已清理
  - 登录与 push 共用同一 deviceId（修复服务器 `403 device_mismatch`）
- **待验证**：重启 CLI 后，在已登录会话中对真实资料执行一次接受审批后的 push，并重新读取
  profile 确认生效（验证 Session deviceId 对齐修复）。

### C3. 测试账号 Credit 余额不足

- **证据**：服务器 LLM 网关返回 `402 insufficient_credits`；评测/生成临时改用
  `DEEPSEEK_API_KEY` 直连。
- **状态**：外部依赖，未解决（充值后恢复网关计费）

## D. CLI 基础设施

### D1. 终端中文参数编码破坏

- **证据**：PowerShell 传中文 prompt 参数乱码（GBK/UTF-8 冲突），触发 JD 解析异常。
- **状态**：**已解决**（`--prompt-file` UTF-8 读入）

### D2. `--auto-approve` 缺少审计与限制

- **证据**：one-shot 模式自动接受全部挂起审批（含写操作），无审计日志。
- **状态**：**已解决**（2026-08-12）
- **解决方式**：自动接受时完整打印 title/description/summary，并追加审计行到
  `local-output/approvals.log`（JSON：at/actionType/risk/title/description/summary）。

### D3. 语义编译器精度差

- **证据**：`CliSemanticCompiler` 用 `0.55 + bullets*0.1` 拍脑袋公式（见 A1 偏差数据）。
- **状态**：**已解决**（2026-08-12，与 A1 合并重写）
- **解决方式**：像素宽度估算 + 校准参数（见 A1），合格/不合格判定与真实 Chromium 对齐。

### D4（新增）. CLI one-shot 无预算保护

- **证据**：模型死循环时 CLI 无任何兜底，一次运行 30 分钟未结束。
- **状态**：**已解决**（one-shot 40 次模型调用上限 + `continueUntilTerminal` 600s/45
  次续跑预算，耗尽 → `needs_user_decision` 兜底）

### D5（新增）. CLI 未接入 continuation 续跑循环

- **证据**：模型提前停在 `writing`（usage 0.32）时 CLI 直接结束，桌面端会继续注入诊断。
- **状态**：**已解决**（CLI one-shot 接入 `continueUntilTerminal`，0.32 → 0.90 实测收敛）

## E. 性能

### E1. Agent 编排调用数/token 高于旧宿主编排（待对比）

- **证据**：semantic-zh 13 calls / 158k tokens / 57s；semantic-en 10 calls / 105k
  tokens / 34s（真实 LLM 直连）。旧宿主编排无同环境 baseline。
- **状态**：未解决（需同条件对比实测）
- **方向**：解决 B1（减少重写轮次）后可显著降低调用数；再做新旧对比。

## 优先级建议

1. E1（性能对比）→ 2. C2 真实验证（需重新登录）→ 3. A2 边界观察（尾行修复上限）
