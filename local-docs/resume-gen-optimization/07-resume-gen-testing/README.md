# 简历生成链路测试指南（CLI）

> 面向其他 AI 对话 / 协作者的独立操作文档：按本指南可完整复现简历生成测试，
> 判定质量门槛是否达标，并定位失败原因。
> 更新日期：2026-08-13

## 1. 测试对象与目标

测试 `cv-agent-app` 的**简历生成链路**（Agent 全编排 + 真实 Chromium 渲染编译）：

- 输入：用户自然语言请求 + 附件（如个人简历 PDF）
- 输出：`cli-resume.json`（workspace dump）+ `resume.pdf`（真实渲染导出）
- 质量门槛（产品级，判定标准见 §4）

## 2. 环境准备

```bash
cd cv-agent-app
npm install                     # 依赖（含 electron、tsx、pdfjs-dist）
npm run desktop:build           # 构建桌面资产（resume.html 渲染器，electron CLI 必需）
```

**登录**：CLI 使用 Keychain 保存的会话自动恢复；首次需交互登录：

```bash
npm run dev                     # 交互模式，输入邮箱 + OTP 验证码完成登录
```

登录后会话保存在系统安全凭据库，后续运行自动恢复（日志出现 `已自动登录`）。

**模型配置**（`.env`，已被 gitignore）：

```
COOLTO_MODEL=deepseek-v4-flash     # 当前推荐模型（实测优于 v4-pro）
COOLTO_API_BASE_URL=https://hkapi.coolto.com.cn
DEEPSEEK_API_KEY=***               # 或 COOLTO_LLM_GATEWAY_BASE_URL
COOLTO_AGENT_THINKING_LEVEL=off    # 必须 off（带思考无法 5 分钟内完成）
```

## 3. 测试命令

### 3.1 生产模式（不限时，简历必然生成出来）

```bash
# 构建 electron CLI bundle（改代码后必须重建）
npx esbuild src/cli/electron-main.ts --bundle --platform=node --format=cjs \
  --external:electron --external:@napi-rs/keyring \
  --outfile=out/cli/electron-main.cjs

# 运行（--no-timeout：状态驱动，超 5 分钟也会继续生成）
./node_modules/.bin/electron out/cli/electron-main.cjs \
  --no-timeout \
  --auto-approve \
  --attach local-output/chen-jiansheng.pdf \
  --prompt-file local-output/generate-prompt.txt \
  --dump-resume local-output/cli-resume.json
```

### 3.2 测试模式（5 分钟预算，衡量达标率）

```bash
./node_modules/.bin/electron out/cli/electron-main.cjs \
  --max-minutes 5 \
  --auto-approve \
  --attach local-output/chen-jiansheng.pdf \
  --prompt-file local-output/generate-prompt.txt \
  --dump-resume local-output/cli-resume.json
```

### 3.3 参数说明

| 参数 | 说明 |
|---|---|
| `--no-timeout` | 生产模式：不限总时长；初始回合 360s 后移交续跑，续跑调用上限 120 |
| `--max-minutes N` | 测试模式：总预算 N 分钟（初始 210s + 续跑，30s 余量） |
| `--auto-approve` | 自动接受全部审批（profile 更新 / 保存等），测试用 |
| `--attach <path>` | 附件（PDF/DOCX/TXT），简历生成时从中提取缺失的 profile 字段 |
| `--prompt-file <path>` | 一次性请求文本（one-shot 模式） |
| `--dump-resume <path>` | 导出最终 workspace 结构 JSON |
| `npm run dev` | node 入口（估算器编译，开发用，数字与真实渲染有 ~6% 偏差，**不用于验收**） |

## 4. 质量门槛（判定标准）

| # | 门槛 | 标准 | 验证方式 |
|---|---|---|---|
| 1 | 页面占用率 | **≥92%**（目标 95%，上限 98%） | `cli-resume.json` 的 `usageRatio`，或导出编译 |
| 2 | bullet 尾行 | 最后一行 **≥70%** 行宽 | PDF 导出零 `bullet_tail_too_short` 警告 |
| 3 | 时长 | 目标 **≤5 分钟**（测试模式强制；生产不限时） | `real` 时间 |
| 4 | 尾部句号 | 每个 bullet 末尾**禁止**句号（。．.！!？?；;） | 检查 dump 中 bullet 文本结尾 |
| 5 | 重复片段 | 无 ≥10 字重复片段（句内）/ ≥20 字（跨 bullet） | `findRepeatedFragment` 扫描 |
| 6 | 数字真实性 | 所有具体数字必须逐字来自证据原文；未知名额用 `XX%` 占位符，禁止编造 | 校验器拒绝即说明违规 |

## 5. 测试流程（Step by Step）

### Step 1：准备输入

```bash
# 附件：用户简历 PDF（解析后用于补全 profile 姓名/电话/邮箱）
# prompt 文件示例（local-output/generate-prompt.txt）：
#   请基于 JD 库中的腾讯天美 AI 应用开发实习生 JD 和经历库中已导入的经历，
#   生成一份针对性中文简历。严格遵循：每条 bullet 宁长勿短（目标字符数要够，
#   避免尾行违规）；写满页面到 85% 以上；最终达到 ready_for_approval 或
#   needs_user_decision。生成过程中不要询问我，直接执行。
```

### Step 2：跑一轮

```bash
# 建议重定向日志便于分析
{ time ./node_modules/.bin/electron out/cli/electron-main.cjs \
  --no-timeout --auto-approve \
  --attach local-output/chen-jiansheng.pdf \
  --prompt-file local-output/generate-prompt.txt \
  --dump-resume local-output/cli-resume.json; } > local-output/run.log 2>&1
```

### Step 3：检查 dump

```bash
python -c "
import json
d = json.load(open('local-output/cli-resume.json', encoding='utf-8'))
print('status:', d['status'], '| usage:', d['usageRatio'])
for s in d['structure']['sections']:
    print(s['heading'], '| bullets:', sum(len(i['bullets']) for i in s['items']))
"
```

- `status=layout_qualified`：Agent 自评全部门槛达标（最佳结果）
- `status=needs_user_decision`：有未解决项，需人工判定（看日志末尾 Agent 说明）

### Step 4：导出 PDF 验证（真实渲染的最终判定）

```bash
npm run pdf:export -- --structure local-output/cli-resume.json --out local-output/resume.pdf
```

| 导出输出 | 含义 |
|---|---|
| `PDF 已导出`（无警告） | **三门槛全过**（占用率 + 尾行 + 单页） |
| `警告：存在 N 条尾行违规，仍按当前内容导出` | 仅尾行未达标（占用率达标） |
| `PDF 导出失败：未达标（usageRatio=…）` | 有硬性违规（溢出 / 占用不足 / 尾行），列出违规码 |

### Step 5：统计达标率（多轮）

```bash
# 循环跑 N 轮，每轮独立 dump，最后统计
for r in 1 2 3; do
  ./node_modules/.bin/electron out/cli/electron-main.cjs \
    --max-minutes 5 --auto-approve \
    --attach local-output/chen-jiansheng.pdf \
    --prompt-file local-output/generate-prompt.txt \
    --dump-resume "local-output/final-r$r.json" > "local-output/final-r$r.log" 2>&1
done
```

参考基线：70% 尾行门槛 + flash 模型 + 5 分钟模式 = **达标率 ~67%（3 轮 2 过）**；
`--no-timeout` 模式有 `layout_qualified` 完整达标轮（93.99%，零警告导出）。

## 6. 日志解读与常见失败模式

日志中每行工具调用格式：`[工具] 名称` / `[工具失败] 名称：原因`（失败原因已注入日志）。

| 失败模式 | 日志特征 | 含义 / 处理 |
|---|---|---|
| 数字编造 | `数字 30 在证据原文中不存在` | 模型写了证据外的数字；宿主自动补引同经历证据，仍缺失则拒绝。正确行为，模型应改用 XX% 占位 |
| 长度不足 | `长度 57 超出目标 75-165` | bullet 太短（<60 字）；模型应写满 2 行以上或调低 targetChars |
| 重复片段 | `文本包含重复片段 "…"`（≥10 字） | 句内重复；模型需换表述 |
| 跨 bullet 重复 | `非证据措辞与已提交内容存在重复片段`（≥20 字） | 与其他 bullet 措辞重复；换表述 |
| 证据冲突 | `与已提交 bullet 的引用区间重叠` | 同一证据被两条 bullet 引用；换未消费证据（技能区除外） |
| 挂起 | `[续跑] continuation:turn-timeout:N` | 单轮模型请求超 60s；非致命（连续 3 次才结束） |
| 时间截断 | `continuation:time` / `continuation:calls:N` | 测试模式预算耗尽，workspace 归一为 needs_user_decision |

**判断"是否健康"**：单轮工具失败数 <30 属正常；>100 说明模型陷入某种循环
（看失败原因聚类）。尾行残留 + `needs_user_decision` 且日志显示 Agent 在做像素
心算（"X 字应该 Y 行"）→ 模型未按"修饰语补齐"执行，可重跑或换模型。

## 7. 关键文件索引

| 文件 | 作用 |
|---|---|
| `src/cli/main.ts` | CLI 核心（`runCli(compiler)`，预算 / 审批 / 续跑驱动） |
| `src/cli/electron-main.ts` | electron 入口（真实 Chromium 编译） |
| `src/cli/node-main.ts` | node 入口（估算器，开发用） |
| `src/cli/args.ts` | 参数解析（--no-timeout / --max-minutes / --attach…） |
| `src/cli/semantic-compiler.ts` | 估算器编译（仅开发） |
| `src/cli/render-event.ts` | 工具调用 / 失败原因日志 |
| `src/resume/compiler-types.ts` | 质量门槛常量（占用率 0.92/0.95/0.98、尾行） |
| `src/desktop/renderer/src/resume/template/resume-layout-templates-v1.json` | 模板 `gate_ratio: 0.7` |
| `src/resume/workspace/diagnostics-projection.ts` | 尾行缺口（shortByChars）、续跑指令 |
| `src/resume/workspace/evidence-single-operation.ts` | patch 校验（重复 / 数字 / 长度） |
| `src/tools/agent-orchestrated/bullet-validator.ts` | write_bullet 校验（数字自动补引、夹取） |
| `src/resume/evidence-validation.ts` | `normalizeEvidenceBinding`（尾部句号 strip） |
| `src/resume/evidence-numbers.ts` | 数字提取（模糊中文数字过滤） |
| `src/agent/system-prompt.ts` | Agent 行为规则（修饰语 / 占位符 / 句号 / 收尾） |
| `src/desktop/main/resume-continuation.ts` | 续跑循环（超时保护、预算） |
| `local-output/` | 附件、dump、日志（gitignore，不入库） |

## 8. 注意事项

1. **验收必须用真实渲染**：`npm run dev`（估算器）与导出的数字有 ~6% 偏差；
   一切以 `cli:electron`（真实 Chromium）和 `pdf:export` 为准。
2. **改代码后必须重建 bundle**：`npx esbuild src/cli/electron-main.ts …`，
   否则跑的是旧逻辑。
3. **`.env` 不入库**：模型 / API 配置在本地，克隆后需自行配置。
4. **登录会话在 Keychain**：换机器 / 清凭据后需交互登录一次。
5. **profile 缺失**：服务端 profile 缺姓名/电话时，Agent 会自动从附件提取并
   发起审批（`--auto-approve` 接受后写入）；`contactEmail` 用账号邮箱兜底。
6. **模型选择**：实测 `deepseek-v4-flash`（无思考）达标率优于 `v4-pro`；
   更换模型后建议至少跑 2-3 轮对比。
