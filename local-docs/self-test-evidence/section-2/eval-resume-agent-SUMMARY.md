# Section-2: eval:resume-agent (LLM)

- Date: 2026-10-18 (Asia/Shanghai)
- Command: `npm run eval:resume-agent` (BYO `LLM_*` only; Node 22)
- Env: `COOLTO_RESUME_AGENT_EVAL_RESULT_PATH` → `section-2/eval-resume-agent-result.json`
- Case filter: `COOLTO_RESUME_AGENT_EVAL_CASE` (used for rate-limit retries)
- Exit (combined evidence): **0 / passed=true** (3/3)
- Model: `agnes-2.5-flash` (name only; **no key material**)

## Root cause fixed

Eval previously called `ensureAuthenticated` → `performEmailOtpLogin`, which throws in non-TTY (`AuthInteractiveRequired`). Model deps already used BYO OpenAI-compatible (`createConfiguredModelDependencies` / commit `03bf676`) and ignored the session token — Coolto OTP was dead weight.

## Fix

- Skip Coolto OTP entirely; require `LLM_API_KEY` (or `OPENAI_API_KEY` / `DEEPSEEK_API_KEY`).
- Cap OpenAI-compat `maxTokens` at 65536 (DeepSeek template was 384000 → Agnes `400 max_tokens exceeds limit`); optional `LLM_MAX_TOKENS`.
- Align assertions/prompt with current tools: `create_resume_workspace` + `apply_resume_content` (old `get_resume_source_snapshot` / `prepare_resume_draft` / `write_bullet` removed from surface).

## Agnes HTTP

**Yes — real calls.** Combined usage ≈ 271k tokens across 3 cases. First blocker was auth; second was `max_tokens`; third was free-tier **429** when running all cases back-to-back.

## Result

| Case | Passed | Status | Notes |
|------|--------|--------|-------|
| semantic-zh | true | ready_for_approval | Full-suite first case |
| semantic-en | true | ready_for_approval | Solo retry after 429 backoff |
| semantic-missing | true | (no workspace) | Solo retry; asked for material |

Back-to-back full suite once hit 429 on en/missing after zh passed; evidence JSON merges the three successful runs (see `notes` field).

## Artifacts

- `eval-resume-agent-result.json`
- `eval-resume-agent.log` (last full-suite attempt)
- `eval-semantic-*-result.json` (solo retries)
