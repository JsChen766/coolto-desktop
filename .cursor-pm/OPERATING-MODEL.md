# Single-agent operating model (Cursor)

Updated: 2026-09-11

The `.codex-pm` program assumed **multiple agents**: OMP implementer, Fresh Advisor, Sol `test_verify`, Herdr polling. **Current reality:** one Cursor agent (+ user) on App; Backend handback may still be separate sessions but not a fixed fleet.

## What changes

| Old (multi-agent) | Now (single-agent) |
| --- | --- |
| Independent Sol ACCEPT | **Milestone close**: same agent runs the written acceptance checklist + user approves merge |
| Fresh Advisor PASS | **Adversarial self-pass**: read acceptance plan, add/run regression tests for known REJECT themes; log gaps in evidence |
| Dispatch / poll / handoff | **Serial tasks in one thread**: implement → gate → snapshot → merge |
| Freeze for external verifier | **Repro snapshot**: path list + SHA-256 + `git status` digest so you can diff later or audit with another model if you want |

## What does not change

- One App worktree writer at a time; trunk `prd-privacy` receives merges only at milestone close.
- `npm run check` and real Electron (or Docker on Backend) are **hard gates** — no “mostly done.”
- Explicit **U** limitations (real recruiting login, production model quality, etc.).
- No commit/push without user authorization.

## Milestone close checklist (each App phase)

1. **Gates:** `npm run check` + phase-specific runtime script (e.g. MAT acceptance).
2. **Scope honesty:** receipt lists owned paths, inherited trunk paths, and **U** items (e.g. combined host not wired).
3. **Snapshot:** save manifest under `.cursor-pm/evidence/` (path, status, content SHA).
4. **Adversarial pass:** re-run tests that failed in prior Sol reports (locks, approval idempotency, search/delete/restore) if they apply to this phase.
5. **User checkpoint:** user confirms “merge to trunk” (replaces formal ACCEPT).
6. **Merge:** `scripts/prd-copy-worktree-paths.mjs` → `prd-privacy` → `npm run check` again on trunk.

Optional: user may later ask **another model** to audit a snapshot; that is advisory, not a program blocker unless the user says so.

## Roles

| Who | Does |
| --- | --- |
| **Cursor agent** | Code, tests, gates, snapshots, evidence, merge execution |
| **User** | Priority, merge approval, commit/push, product/legal U acceptance, optional second-opinion review |
