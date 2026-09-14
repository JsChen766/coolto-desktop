# Phase 5.0+ — local live D₁ snapshot (2026-09-13)

Admin writer: `prd-admin-analytics-d2`  
BE writer: `prd-admin-analytics-handback-be`  
Prod flags: **unchanged** (`compose.prod.yaml` `ANALYTICS_HANDOFF_ENABLED` default false; `PRIVACY_ENFORCEMENT_ENABLED=false` pinned on local overlay).

## What was wired (local only)

Gitignored `.env` (not committed):

- BE: `ANALYTICS_ENABLED=true`, `ANALYTICS_HANDOFF_ENABLED=true`, local token/ref/hashes
- Admin: `ANALYTICS_HANDOFF_BASE=http://host.docker.internal:8080` + same service token

Tracked:

- Handback `compose.yaml` overlay injects analytics/handoff env (defaults still **false**)
- Admin BFF path: `/v1/internal/admin/analytics/projection-snapshot`
- BE `cmd/api/analytics.go`: pass `ServiceAudience` + `RequestTimeout` into handoff options (empty audience was `403 handoff_forbidden`)

## Verification

| Check | Result |
| --- | --- |
| BE container flags | `ANALYTICS_ENABLED=true`, `HANDOFF=true`, `PRIVACY=false` |
| `GET /v1/internal/admin/analytics/projection-snapshot` + Bearer + `X-Service-Audience: admin-analytics` | **200** `datasetProvenance=synthetic`, `fixtureId=local-admin-analytics-v1`, empty facts/seeds (no ingest yet) |
| Admin session `GET /api/dashboard/usage-d1-snapshot` | **200** same live envelope (not web synthetic fixture) |
| Unauthenticated Admin BFF | **401** `session_invalid` |
| `compose.prod.yaml` handoff default | **false** |

Local Admin login (bootstrap, gitignored `.env`): `admin@local.dev`.

## Not done

- No product events yet → Usage four-family charts are empty on live data (fixture had synthetic buckets).
- Remaining analytics pages.
- PR / prod enable.
