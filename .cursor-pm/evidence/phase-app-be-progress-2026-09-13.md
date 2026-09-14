# App + Backend progress (2026-09-13)

User asked to pause Admin and finish App frontend + Backend first.

## Two completion bars

Do not mix them. Serial PRD (`.cursor-pm`) is the active ledger. July P0 (`local-docs/p0-product-completion-roadmap/README.md`) is the full product remaining chain.

### A) Serial PRD (Phases 3–4)

| End | Where | Code | Automated gates | Remaining |
| --- | --- | --- | --- | --- |
| **App** | `.codex-worktrees/prd-privacy` `837fbad` (`codex/prd-privacy`) | C1–C3 committed locally | `check`, `qa:phase-4-c2`, `qa:phase-4-c3` (196), MAT + synthetic RES **PASS** | Manual U; not pushed; not in prod **0.1.27** |
| **Backend D₁** | `.codex-worktrees/prd-admin-analytics-handback-be` `fc561f0` | D₁ handback on branch | `go test -race`, OpenAPI, gofmt, privacy migration, **isolated** DB acceptance **PASS** | Uncommitted overlay (audience/timeout + compose inject); not merged to `main`; prod handoff still off |

App writer checkout `cv-agent-app` (`codex/browser-enhance-be0-be5`) is **not** this line.

App U still open (`phase-4-manual-test-checklist.md`):

- Main-window 材料库 smoke
- Mail OAuth + `mail_app_schedule`
- Real recruiting sites
- PLAT 200% / crash recovery
- Real-model RES ≤600s + cloud
- Privacy consent upgrade (must not enable `PRIVACY_ENFORCEMENT_ENABLED` against 0.1.27)

`COOLTO_C3_ANA_BACKEND=1` was listed as optional on the App C3 path; the same isolated Docker script already **PASS** as Phase 3 DB acceptance. Do not `migrate up` on shared `cv-agent-app-be`.

BE dirty (not committed, 2026-09-13 live-snapshot fix):

- `cmd/api/analytics.go` — pass `ServiceAudience` / `RequestTimeout` (empty audience was `403`)
- `compose.yaml` — analytics/handoff env overlay (defaults still false)
- `.env.example` — documented keys

Phase 3 leftover for close: freeze manifest + merge to canonical `cv-agent-be` **when user approves**.

### B) Full P0 product (not closed)

Roadmap pointer: BE7 代码闭环、真实运行验收待回补 → BSF5/BE6 平台验收延期 → **BE8** → **S4.5 H / L18+L20 真模型** → **S5** → R1.

S1–S4, J0–J3, E0–E6, P0–P4 code stages are marked complete in that README. Remaining is mostly **real-run / platform / quality** plus S4.5 Section H.

## Production vs local trunks

Independent pipelines; not version-locked.

| End | Production | Local serial trunk |
| --- | --- | --- |
| App | `app` **0.1.27** (~2026-09-08/09) | `prd-privacy` `837fbad` (unpushed) |
| BE | `cv-agent` `main` ~2026-08-20, goose **00011** | D₁ branch `fc561f0` + dirty overlay |
| Admin | `admin` `131f1bb` | Phase 5 paused |

Merging D₁ to prod `main` with **default flags off** should not break 0.1.27. Do **not** set `PRIVACY_ENFORCEMENT_ENABLED=true` until App consent UI ships.

## What this session will not start without confirmation

- Admin Home / Growth D₁ pages
- BE8 / S4.5 Section H / S5
- `commit` / `push` / PR
- Shared-DB `migrate up`

## What “finish App + BE” can mean next

1. **Serial close:** user runs Electron U; agent can keep BE overlay uncommitted or commit only if asked; merge/push only if asked.
2. **Ship:** push `prd-privacy` and D₁ BE → remotes, flags off on prod.
3. **Full P0:** start the July remaining chain (large; BE7 实测 / BE8 / S4.5 H).
