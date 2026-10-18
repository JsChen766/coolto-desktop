# Section-2: eval:resume-agent (LLM)

- Date: 2026-10-18 (Asia/Shanghai)
- Command: `npm run eval:resume-agent`
- Env: `COOLTO_RESUME_AGENT_EVAL_RESULT_PATH` → `section-2/eval-resume-agent-result.json`
- Exit: **1**
- Duration: ~1s

## Failure (blocker)

Non-interactive terminal cannot complete Coolto OTP login:

```
Error: 当前终端无法安全读取登录信息。请在交互终端运行。
  at performEmailOtpLogin (src/cli/login.ts)
  at ensureAuthenticated (src/auth/session-manager.ts)
```

- No stored Keychain session restored
- `.env` provides LLM_* only (no Coolto email/password session bootstrap)
- No result JSON written (failed before cases)
- Model configured (name only): `agnes-2.5-flash` via `readConfig()` — **no key material recorded**

## Error type (desensitized)

`AuthInteractiveRequired` / OTP login blocked in non-TTY — not an Agnes LLM HTTP failure (eval never reached model calls).

## Verdict

**BLOCKED** — needs interactive Coolto login or a pre-seeded session before LLM eval cases can run.
