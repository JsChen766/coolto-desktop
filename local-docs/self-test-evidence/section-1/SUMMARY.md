# Section-1 summary — browser agent QA + site policy

- Date: 2026-10-18 (Asia/Shanghai)
- Node: v22.23.3

## Commands

1. `npm run qa:browser-agent`
   - Exit: **0**
   - Suite: `bsf3-v1`
   - Passed: **36** (all listed results `passed: true`)
   - Runtime: electron 43.2.0 / linux
   - Duration: ~14s wall (incl. desktop:build)
   - Log: `local-docs/self-test-evidence/section-1/qa-browser-agent.log`
   - Report JSON: `local-docs/self-test-evidence/section-1/qa-browser-agent-report.json`
   - Notes: benign dbus/gpu stderr noise; no API keys in log

2. Recruiting site policy check
   - See `recruiting-site-policy-check.md`
   - boss_zhipin / jobsdb_hk / linkedin remain `status: "candidate"`, `verifiedAt: null`

## Verdict

**PASS**
