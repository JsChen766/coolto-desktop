# Phase 4 — C3 Tier2 longitudinal gates

Date: 2026-09-12  
Worktree (gates): `E:\vsProjects\coolto\.codex-worktrees\prd-privacy` (post-merge trunk lock-in)  
Original dev: `prd-app-closure`

## Command

```bash
npm run qa:phase-4-c3
```

Optional heavy gates (same script):

| Env | Tier | Action |
| --- | --- | --- |
| `COOLTO_C3_ANA_BACKEND=1` | ANA | `py -3` → `prd-admin-analytics-handback-be/scripts/run-analytics-handback-db-acceptance.py` |
| `COOLTO_C3_RES_RUNTIME=1` | RES | `desktop:build` + `scripts/run-resume-runtime-acceptance.mjs` |

## Tier2 mapping (incremental)

| # | Tier | Node gate (default) | U / optional |
| --- | --- | --- | --- |
| 1 | ANA | preference signal, stage policy, resolution, profile sync | D₁ DB acceptance |
| 2 | RES | restorer, source snapshot, quality, publication API | Real model ≤600s; runtime acceptance |
| 3 | DEL | recruiting form/takeover, application submission, receipts | Real sites; `qa:phase-4-c2` browser |
| 4 | PRI | deletion, local clear, export crypto, privacy service | Deletion interrupt / consent upgrade手测 |
| 5 | SCORE | resume-quality, normalizers, fact-neutral | Full calibration set out of repo |
| 6 | PLAT | IME policy, AX tagger/observation, privacy UI contract | 200% zoom / crash recovery手测 |
| 7 | SIGNOFF | application write boundary, outbox, cross-account material/privacy | — |

## Result

| Gate | Result |
| --- | --- |
| `npm run qa:phase-4-c3` (Node) | **PASS** — 196 tests, 2026-09-12 |
| `COOLTO_C3_ANA_BACKEND` / `COOLTO_C3_RES_RUNTIME` | Not run this session |

## Phase 4 close checklist (remaining)

- [x] `npm run qa:phase-4-c2` full Electron chain — **PASS** 2026-09-12
- [ ] `COOLTO_C3_RES_RUNTIME=1` on a machine with `desktop:build` + time for acceptance
- [ ] `run-material-product-acceptance.mjs` (C1 tesseract env)
- [ ] Manual matrix in `phase-4-manual-test-checklist.md`
- [ ] User checkpoint → merge closure → `prd-privacy` via manifest copy
