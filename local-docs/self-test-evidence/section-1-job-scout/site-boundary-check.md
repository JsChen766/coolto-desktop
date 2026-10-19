# 站点边界核对（本轮附带）

对照 `local-docs/site-support-boundary.md` 与 `src/browser/recruiting-site-policy.ts`。

| siteId | status | verifiedAt | 本轮断言 |
|--------|--------|------------|----------|
| boss_zhipin | candidate | null | 单测 `candidate policy never implies verified…` PASS |
| jobsdb_hk | candidate | null | 同上 |
| linkedin | candidate | null | 同上 |

Greenhouse / Lever：仅 Job Scout **公开 API 搜岗**（`qa:job-scout`）；**不是** verified 投递站点。
