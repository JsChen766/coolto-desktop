# Section-2: qa:resume-renderer

- Date: 2026-10-18 (Asia/Shanghai)
- Command: `npm run qa:resume-renderer`
- Exit: **1**
- Duration: ~64s (incl. desktop:build)

## Failure

Assertion at `scripts/run-resume-renderer-qa.mjs:94`:

```
assert.equal(byId.get("long-contact-qualified").qualified, true);
```

Actual: `qualified === false` for fixture `long-contact-qualified`.

Electron process itself exited 0 and wrote artifacts; post-assertions failed.

## Evidence

- Log: `local-docs/self-test-evidence/section-2/qa-resume-renderer.log`
- Full result JSON: `resume-renderer-result.json`
- Fixture summary: `resume-renderer-fixtures-summary.json`
- Screenshots/PDF (from tmp artifact): `qualified.png` (+ originals under `/tmp/coolto-resume-renderer-qa-4IDb3i/`)

## Verdict

**FAIL** (fixture regression: long-contact-qualified)

## Fixture compile results (from ignored result.json)

| fixtureId | qualified | overflowPx | usageRatio | violations |
|---|---|---|---|---|
| education-details-qualified | True | 0 | 0.966 | — |
| education-details-qualified | True | 0 | 0.966 | — |
| body-scale-probe | False | 16 | 1.0152 | multiple_pages, page_overflow, page_overfilled |
| en-qualified | False | 0 | 0.5097 | bullet_tail_too_short, bullet_tail_too_short, bullet_tail_too_short, bullet_tail_too_short, bullet_tail_too_short, bullet_tail_too_short, bullet_tail_too_short, bullet_tail_too_short |
| mixed-qualified | False | 0 | 0.9958 | page_overfilled |
| markdown-qualified | True | 0 | 0.966 | — |
| long-contact-qualified | False | 0 | 0.9834 | page_overfilled |
| additional-content-qualified | True | 0 | 0.9592 | — |
| underfilled | False | 0 | 0.1041 | page_underfilled |
| tail-failure | False | 0 | 0.1721 | bullet_tail_too_short, page_underfilled |
| overflow | False | 561 | 1.5322 | bullet_tail_too_short, bullet_tail_too_short, bullet_tail_too_short, bullet_tail_too_short, bullet_tail_too_short, bullet_tail_too_short, bullet_tail_too_short, bullet_tail_too_short |

Note: `qualified.png` / `*.json` under local-docs are gitignored; conclusions live in this md + logs.
