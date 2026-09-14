# Phase 3 gates — D₁ Admin Analytics handback (in progress)

Date: 2026-09-12  
Writer: `E:\vsProjects\coolto\.codex-worktrees\prd-admin-analytics-handback-be`  
Branch: `codex/prd-admin-analytics-handback-be`

## Known v2 independent themes (repair target)

From `.codex-pm/PROGRAM.md` / Sol REJECT v2:

1. Privacy migration verifier vs latest migration (expect `goose_db_version` max **18** in `verify-privacy-consent-migration.py`).
2. Compactor: multi-family seeds (funnel / resume / browser / application) + duration summaries.
3. Handoff service token: active + previous bounded grace / revoke (see `analytics_handoff.go`, `admin_handler_test.go`).
4. OpenAPI: four admin handback success response envelopes aligned with runtime.

## Infra fix (2026-09-12)

`compose.yaml` now re-mounts **this worktree** into `api` / `migrate` (included `cv-agent-be` compose otherwise mounted main checkout only).

## Gate commands (from worktree root)

```powershell
docker compose run --rm --no-deps api go test -race ./...
docker compose run --rm --no-deps api sh -ec 'test -z "$(gofmt -l ./cmd ./internal)"'
docker run --rm --network none -v "${PWD}:/spec:ro" -w /spec redocly/cli:2.31.6 lint api/openapi/openapi.yaml
python3 scripts/verify-privacy-consent-migration.py
```

| Gate | Result |
| --- | --- |
| `compose.yaml` worktree mount | **fixed** 2026-09-12 |
| `go test -race ./...` (Docker) | **PASS** |
| Redocly `openapi.yaml` | **PASS** |
| `gofmt -l cmd internal` | **clean** |
| `go vet` / `go build` | **PASS** |
| `verify-privacy-consent-migration.py` | **PASS** (tools profile + high ports on Windows) |

## Local Docker inventory (2026-09-12)

| Project | Services | Host ports (notable) |
| --- | --- | --- |
| `cv-agent-app-be` (`prd-privacy-be`) | api, postgres, redis, mailpit | **8080**, **15432**→5432, **6379**, **8025** |
| `cv-agent-api-service` | api | **3000** |

Handback **不要**对共享 `cv-agent-app-be` 直接 `migrate up`（会与 privacy 库 goose 状态冲突）；DB 验收用隔离栈。

## DB integration acceptance

`py -3 scripts/run-analytics-handback-db-acceptance.py` — **PASS** (analytics + privacy postgres/application DB tests, `-race`).

## Production image (local only)

2026-09-12:

```text
docker build --target production --tag cv-agent-app-be:local .
```

**PASS** (~28s). Same as `make build`; does not push or deploy.

## Remaining for Phase 3 close

- Dual freeze manifest + merge to canonical `cv-agent-be` when user approves.
