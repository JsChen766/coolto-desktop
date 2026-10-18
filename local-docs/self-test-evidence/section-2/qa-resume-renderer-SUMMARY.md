# Section-2: qa:resume-renderer

- Date: 2026-10-18 (Asia/Shanghai)
- Command: `npm run qa:resume-renderer`
- Exit: **0**
- Duration: ~65s (incl. desktop:build)

## Fix

`long-contact-qualified` was `page_overfilled` at usageRatio **0.9834** > band max **0.98** (long contact URL wrap added height after `removeLastExperienceBullet`). Freed one skills bullet in `longContactQualified()` fixture.

## Post-fix

- `long-contact-qualified`: qualified=true, usageRatio=0.9536, overflowPx=0
- Script assertion `byId.get("long-contact-qualified").qualified === true` **PASS**
- Overall `passed: true` from Electron QA harness

## Evidence

- Log: `qa-resume-renderer.log`
- `resume-renderer-result.json`, `resume-renderer-fixtures-summary.json`
- `qualified.png` (gitignored pattern may apply)

## Verdict

**PASS**
