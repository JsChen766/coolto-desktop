# §9 匹配分数可信表达 — 自测证据（2026-10-18 Asia/Shanghai）

## 验收勾选表

| 验收项 | 现状 | 证据 |
|--------|------|------|
| UI 明确「非录用概率」 | **满足**（本轮加固） | `MatchReportCard` / `MatchReportPanel` 展示「相对参考，非录用概率」；i18n 英译含 “not a hiring probability”；工具 summary `disclaimer` + instruction；契约测试 `Match card and panel state score is relative reference…` |
| 高分/扣分项可回到 JD 要求与经历证据 | **满足** | Panel：亮点 `requirementText` + `sourceQuote`；缺口 `requirementText` + `explanation`/`suggestion`；Card 摘要可点开 Panel；契约测试 `Match card and panel keep highlight evidence…` |
| 信息不足不输出假高精度 | **满足**（本轮加固） | 宿主 `resolveHostCoverage` 重算覆盖率/证据完整度，`min(声称, 宿主)` 防虚报；`presentMatchScore` 低证据降精度（medium 取整、low 取 5 分档）并标置信；Panel 展示覆盖率/证据完整度/规则版本/本机模型名；`scorerVersion=1.1`；测试 `match-score-trust` + `host clamps inflated…` |

## 本轮改动（缺口补齐）

1. `src/match/score-trust.ts`：宿主覆盖率/证据完整度重算、置信档、展示精度降级、`MATCH_SCORER_VERSION=1.1`。
2. `src/tools/prepare-match-analysis.ts`：写入宿主重算后的比率；记录本机 `modelId`（默认 `local-byo`）；summary 免责声明。
3. `match-emitter` + `MatchReportArtifactData`：透传 `displayScore` / `scoreConfidence` / `modelId` / `scorerVersion`。
4. UI：Card/Panel 免责 + 低置信提示；Panel 信任区（覆盖率/证据/规则/模型）。
5. `system-prompt` → `v159`：相对参考、非录用概率、不得虚报覆盖率或假高精度。
6. 测试：`match-score-trust`、`match-report-ui-contract`、prepare-match / system-prompt 断言。

## 命令证据

```text
unset NPM_CONFIG_PREFIX; nvm use 22
node --import tsx --test --test-concurrency=1 \
  test/match-score-trust.test.ts \
  test/match-scorer.test.ts \
  test/match-report-builder.test.ts \
  test/match-report-resume-instruction.test.ts \
  test/match-report-ui-contract.test.ts \
  test/prepare-match-analysis-tool.test.ts \
  test/system-prompt.test.ts
# pass 41（见 match-unit-tests.log）
```

证据中无 `.env` / API Key 明文。

## 残留弱点

- 完整 Electron GUI 点通（对话→匹配卡→侧栏）依赖本机桌面；本轮以单元/契约测试为主，未在无显示 box 上跑 UI QA。
- 宿主尚未校验 `sourceQuote` 是否逐字出现在冻结经历正文（仍依赖模型诚实 + revision hash 绑定）；虚报引用需后续加强。
- 维度分仍由模型给出，宿主只保证权重加权与覆盖率/证据完整度不可虚高；极端情况下模型仍可给虚高维度分，但低证据时 UI 会降精度并标低置信。
