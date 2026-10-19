# §1 求职 / 投递 fixture 加深 — 证据（2026-10-19 Asia/Shanghai）

对照 PRD §1（真实投递闭环，开源裁剪）与 `site-support-boundary.md`。  
**本轮默认 fixture / 公开 API，未要求职账号、未对 candidate 真站做人肉登录投递。**

## 分项结论

| 路径 | 覆盖步骤 | 结论 |
|------|----------|------|
| `npm run qa:job-scout` | **搜岗**：Greenhouse / Lever 公开 Job Board API → ingest leads → 二次 fetch 去重（state=`unchanged`） | **PASS**（exit 0；passed=2） |
| `npm run qa:browser-agent`（本轮复跑） | **打开申请页 → 填表/交互 → 提交确认 → 本机回执**：含 `14c SubmissionIntent confirms fixture form`、`14d SubmissionReceipt creates Tracker once`；另有 submit 拦截 `14a/14b` | **PASS**（exit 0；suite `bsf3-v1`；passed=**36**） |
| 单测 `job-scout` / `recruiting-site-policy` / `site-policy-registry` / `recruiting-page-source` | API 源、candidate 不升格 verified、只读受管识别等 | **PASS**（16 tests） |
| 真站登录 / OTP / CAPTCHA / candidate 一键投递 | — | **deferred**（需用户接管；BOSS/JobsDB/LinkedIn 仍为 `candidate`） |

相对「真登录投递」还差：真实 ATS 登录会话、OTP/CAPTCHA 接管恢复、candidate 真站端到端提交与法律声明——开源验收以 **托管 fixture + 公开搜岗 API** 为准，真站不升格 verified。

## 命令

```bash
npm run qa:job-scout
# → Greenhouse 18 jobs / Lever Demo 10 jobs；二次 fetch 无重复 id

npm run qa:browser-agent
# → desktop:build + Electron fixture HTTP；36 cases passed

node --import tsx --test --test-concurrency=1 \
  test/job-scout.test.ts \
  test/recruiting-site-policy.test.ts \
  test/site-policy-registry.test.ts \
  test/recruiting-page-source.test.ts
```

## 产物

| 文件 | 说明 |
|------|------|
| `qa-job-scout.log` | Job Scout 公开源跑录（含 sampleRole / 公开 job URL） |
| `qa-browser-agent-rerun.log` | 本轮 managed apply fixture 全量 JSON 报告 |
| `job-scout-unit-tests.log` | 相关单测 TAP |
| `site-boundary-check.md` | candidate / 搜岗来源边界 |

既有 `section-1/`（2026-10-18）与 `gui-smoke/` 仍作旁证；本目录为本轮独立加深。

## 总评

**PASS（fixture 主证据）**：搜岗（Job Scout 公开 API）+ 填表/提交确认/本机 Application 回执（browser-agent fixture）均绿。  
**真登录投递 = deferred**；未要账号、未 push。
