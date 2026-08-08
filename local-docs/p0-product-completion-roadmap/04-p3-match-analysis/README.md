# P3 · Match Analysis（岗位匹配分析）

## 目标

当用户让 Agent 将当前简历与某条 JD 比对时，Agent 调用 `prepare_match_analysis` 工具：
- 对 4 个维度（技能/经验/教育/综合印象）打分
- 列举强匹配亮点（每条附引用来源）和缺口（附严重程度与建议）
- 工具计算最终加权分、存储本地报告、触发 IPC 事件
- 宿主渲染聊天卡片（摘要）与侧边栏面板（完整报告）

**生命周期：本地临时 artifact，不写云端，不需要 Approval 流程。**

---

## 架构约束

| 约束 | 要求 |
|------|------|
| 上帝类 | 禁止。scorer / builder / store / tool 各独立文件 |
| 行数   | 业务文件 ≤ 220 行目标，≤ 250 行硬限制 |
| 测试   | 使用 `node:test` + `node:assert/strict`，每个核心类 ≥ 5 用例 |
| 命名   | camelCase；事件名 `match.report.created` |

---

## 文件分配与行数预算

### 核心逻辑（`src/match/`）

| 文件 | 职责 | 预算 |
|------|------|------|
| `types.ts` | MatchReport 合约（已存在，99 行） | 不变 |
| `scorer.ts` | `computeFinalScore(dims)` + `buildDimensionScores(params)` | ≤ 60 行 |
| `report-builder.ts` | `buildMatchReport(params, jdRef, expRefs, meta)` | ≤ 80 行 |
| `report-store.ts` | `MatchReportStore` 类（按 id/latest 查询） | ≤ 80 行 |

### Agent 工具（`src/tools/`）

| 文件 | 职责 | 预算 |
|------|------|------|
| `prepare-match-analysis.ts` | 工具实现，验证 + 组装 + 存储 | ≤ 200 行 |
| `registry.ts` | 添加 `matchReportStore` dep + 条件注册 | +10 行 |

### Desktop 主进程（`src/desktop/main/`）

| 文件 | 职责 | 预算 |
|------|------|------|
| `match-emitter.ts` | 提取 match report IPC emission 逻辑 | ≤ 60 行 |
| `agent-runtime.ts` | 仅添加 ~8 行调用 match-emitter（已 412 行，不加方法）| +8 行 |

### Desktop 共享类型（`src/desktop/shared/types.ts`）

添加：
- `MatchReportArtifactData` 接口（~20 字段）
- `DesktopAgentEvent` union 新增 `match.report.created` branch

### Renderer（`src/desktop/renderer/src/`）

| 文件 | 职责 | 预算 |
|------|------|------|
| `chat/use-match-reports.ts` | 订阅事件，per-conversation 报告列表 | ≤ 80 行 |
| `chat/MatchReportCard.vue` | 聊天流卡片（分数圆环 / 亮点 / 缺口摘要 / 展开按钮）| ≤ 140 行 |
| `panel/MatchReportPanel.vue` | 侧边栏完整报告面板 | ≤ 220 行 |
| `App.vue` | 添加 match panel 分支，wire composable（已 290 行）| +20 行 |
| `chat/use-chat-session.ts` | 添加 match events 订阅（已 298 行）| +15 行 |

### Demo API（`src/desktop/main/desktop-api.ts`）

添加 mock `match.report.created` 事件用于 Browser Demo 验收。

### 系统提示词

扩展 `prepare_match_analysis` 使用规则：何时调用、如何引用证据、打分诚实性要求。

---

## 实施顺序（依赖层序）

```
P3.1  src/match/scorer.ts
P3.2  src/match/report-builder.ts
P3.3  src/match/report-store.ts
P3.4  src/tools/prepare-match-analysis.ts
P3.5  src/tools/registry.ts（添加 matchReportStore）
P3.6  src/desktop/shared/types.ts（MatchReportArtifactData + 事件）
P3.7  src/desktop/main/match-emitter.ts
P3.8  src/desktop/main/agent-runtime.ts（最小接入）
P3.9  src/desktop/renderer/src/chat/use-match-reports.ts
P3.10 src/desktop/renderer/src/chat/MatchReportCard.vue
P3.11 src/desktop/renderer/src/panel/MatchReportPanel.vue
P3.12 src/desktop/renderer/src/App.vue（面板接入）
P3.13 src/desktop/renderer/src/chat/use-chat-session.ts（事件订阅）
P3.14 src/desktop/main/desktop-api.ts（mock 事件）
P3.15 系统提示词扩展
P3.16 测试（test/match-scorer, match-report-builder, prepare-match-analysis-tool）
P3.17 Browser Demo 验收（render card + panel）
```

---

## 工具 Schema（`prepare_match_analysis`）

```typescript
{
  jdId: string,                   // 目标 JD 的 ID
  dimensions: [{
    dimension: "skills" | "experience" | "education" | "overallImpression",
    score: number,                // 0–100，必须诚实
    rationale: string,            // 支撑该分数的关键理由（≤ 500字）
  }],                             // 必须包含全部 4 个维度
  highlights: [{
    requirementId: string,        // JD requirement ID（来自 get_jd 返回值）
    requirementText: string,
    summary: string,              // 一句话说明为何满足
    evidence: [{
      experienceId: string,
      revisionId: string,
      revisionContentHash: string,
      sourceQuote: string,        // 原文引用片段
    }],
  }],
  gaps: [{
    requirementId: string,
    requirementText: string,
    severity: "must_have" | "preferred" | "optional",
    explanation: string,
    suggestion: string,
  }],
  usedExperiences: [{
    experienceId: string,
    revisionId: string,
    contentHash: string,
  }],
  coverageRatio: number,          // 0–1，Agent 估算
  evidenceCompleteness: number,   // 0–1，Agent 估算
}
```

**工具行为：**
1. 验证 4 个维度全部存在，分数 0–100
2. 通过 `jdReader.getJd(jdId)` 读取 JD（验证 requirementIds 存在）
3. 调用 `computeFinalScore(dimensions)` 计算加权分（覆盖 Agent 输入）
4. 调用 `buildMatchReport(...)` 组装报告
5. 存入 `MatchReportStore`
6. 返回摘要：`{ reportId, finalScore, tier, jdTitle, highlightsCount, gapsCount }`

---

## IPC 事件载荷（`MatchReportArtifactData`）

发送完整报告到 Renderer（本地数据，不是云端 API 响应，size 可接受）：

```typescript
interface MatchReportArtifactData {
  reportId: string;
  jdId: string;
  jdTitle: string;
  jdCompany: string | null;
  finalScore: number;
  tier: "excellent" | "good" | "moderate" | "weak";  // ≥90 / ≥70 / ≥50 / <50
  dimensions: MatchDimensionScore[];
  highlights: MatchHighlight[];    // 全量，前端自己截取
  gaps: MatchGap[];                // 全量
  coverageRatio: number;
  evidenceCompleteness: number;
  generatedAt: string;
  expired: boolean;
}
```

---

## UI 规范（参照 foundation/ui-design-standards）

**MatchReportCard（聊天流）：**
- 分数数字大字 + 等级标签（优秀/良好/基本匹配/较弱）
- 最多 3 条亮点（`highlight.summary`）
- 最严重缺口 1 条（`gaps[0].requirementText`）
- "查看完整分析" 展开侧边栏
- 不组合 border + background，遵循设计规范

**MatchReportPanel（侧边栏）：**
- 4 维度得分条（带权重标注）
- 全部亮点（附证据来源引用）
- 全部缺口（severity 标签 + 建议）
- 报告元信息（模型 / 生成时间 / 基于版本）

---

## 测试矩阵

| 文件 | 用例数 | 覆盖要点 |
|------|--------|---------|
| `test/match-scorer.test.ts` | 6 | 权重乘积正确；分数越界抛错；4 个维度加权和 |
| `test/match-report-builder.test.ts` | 6 | 字段映射；ID 格式；meta 字段；深拷贝 |
| `test/prepare-match-analysis-tool.test.ts` | 8 | 存储报告；维度缺失报错；jdId 不存在报错；result 含 reportId；分数由 scorer 决定 |

---

## 验收条件

- [ ] `node --test` 全绿，≥ 20 个新用例
- [ ] Browser Demo：粘贴 JD → 保存 → 发送"请分析匹配度" → 聊天流出现 MatchReportCard → 点击展开 MatchReportPanel 显示完整报告
- [ ] 无文件 > 250 行（`agent-runtime.ts` 已超标，不允许继续增大）
- [ ] 无上帝类（scorer/builder/store/tool 各自独立）

---

## 状态

✅ 完成（2026-07-24）

### 实施结果

| 步骤 | 文件 | 实际行数 |
|------|------|---------|
| P3.1 | `src/match/scorer.ts` | ~60 行 |
| P3.2 | `src/match/report-builder.ts` | ~50 行 |
| P3.3 | `src/match/report-store.ts` | ~60 行 |
| P3.4 | `src/tools/prepare-match-analysis.ts` | ~185 行 |
| P3.5 | `src/tools/registry.ts` | +10 行 |
| P3.6 | `src/desktop/shared/types.ts` | +25 行 |
| P3.7 | `src/desktop/main/match-emitter.ts` | ~40 行 |
| P3.8 | `src/desktop/main/agent-runtime.ts` | +18 行 |
| P3.9 | `src/desktop/renderer/src/chat/use-match-reports.ts` | ~70 行 |
| P3.10 | `src/desktop/renderer/src/components/MatchReportCard.vue` | ~80 行 |
| P3.11 | `src/desktop/renderer/src/components/MatchReportPanel.vue` | ~160 行 |
| P3.12 | `src/desktop/renderer/src/App.vue` | +30 行 |
| P3.13 | `src/desktop/renderer/src/chat/use-chat-session.ts` | +17 行 |
| P3.14 | `src/desktop/renderer/src/lib/desktop-api.ts` | +40 行 |
| P3.15 | `src/agent/system-prompt.ts` v8 | match 分析规则 |
| P3.16 | `test/match-scorer.test.ts` (8例) + `test/match-report-builder.test.ts` (6例) + `test/prepare-match-analysis-tool.test.ts` (8例) | 22 新用例全绿 |
| P3.17 | Browser Demo 验收 | MatchReportCard + MatchReportPanel 渲染完整 |

**注意：** `MatchReportStore` 使用 `MatchReportEntry { report, jdTitle, jdCompany }` 携带 JD 元信息，  
因为 `MatchReport` domain 类型不含 JD title，但 IPC 事件需要它。

**Demo API 补丁：** `isMatch` 正则检查须先于 `isJd`，否则含"JD"字样的匹配请求会误触发 JD 保存流程。
