# Phase 5.0+ — Pipeline D₁ health (2026-09-13)

Writer: `prd-admin-analytics-d2` (uncommitted; **no PR / no push**)

## Slice

Pipeline page (`/pipeline`) now reads D₁ **governance** + **feed watermark** through
the same Admin BFF as Usage snapshot. Browser still has no service token.

| Path | Role |
| --- | --- |
| `GET /api/dashboard/d1-governance` | BE `/v1/internal/admin/analytics/governance` |
| `GET /api/dashboard/d1-feed` | BE `/v1/internal/admin/analytics/projection-feed` (`afterSequence`, `limit`) |
| `web/.../PipelineD1HealthPanel.vue` | Four cards + consent/policy/retention; fixture fallback |

Legacy ETL cards on the same page are unchanged.

## Verification

| Gate | Result |
| --- | --- |
| `go test -race ./internal/modules/dashboard/` | **PASS** |
| `web/` `npm run typecheck` | **PASS** |
| Live Admin session BFF | governance **200** `synthetic` / `local-admin-analytics-v1`; feed watermark **0** |
| Prod flags | untouched |

## Not done

- Home / Growth / Commercial still 100% legacy ETL (commercial not in D₁ contract).
- Usage activation funnel (`funnel\|activation\|*`) still the legacy block.
- PR / push.
