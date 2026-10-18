# Optional: smoke:resume-source — OUT OF SCOPE (OSS)

- Date: 2026-10-18 (Asia/Shanghai)
- Command: `npm run smoke:resume-source`
- Exit: **1** (expected for OSS local path)

## Why out-of-scope

Script requires `COOLTO_EMAIL` + `COOLTO_PASSWORD` and calls Coolto cloud `client.login`. Open-source Desktop is local-first / BYO LLM with **no Coolto cloud login**. Do not request or store Coolto passwords for this evidence lane.

## OSS substitute

- Resume source path for OSS eval: in-process fixtures via `eval:resume-agent` (`scripts/support/resume-agent-eval-fixtures.ts`) + BYO `LLM_*`.
- Log retained: `smoke-resume-source.log` (missing-env failure only).

## Verdict

**OUT-OF-SCOPE** for open-source self-test evidence (not a product regression).
