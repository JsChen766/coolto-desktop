# Section-1: recruiting-site-policy 核对

- Date: 2026-10-18 (Asia/Shanghai)
- File: `src/browser/recruiting-site-policy.ts`
- Command: `rg -n 'siteId: "(boss_zhipin|jobsdb_hk|linkedin)"|status:|verifiedAt' src/browser/recruiting-site-policy.ts`

## Result

| siteId | status | verifiedAt |
|--------|--------|------------|
| boss_zhipin | candidate | null |
| jobsdb_hk | candidate | null |
| linkedin | candidate | null |

Factory `policy()` hard-codes `status: "candidate"` and `verifiedAt: null` for all three exported policies.

**Conclusion:** Candidate sites were **not** promoted to verified. Matches checklist expectation.
