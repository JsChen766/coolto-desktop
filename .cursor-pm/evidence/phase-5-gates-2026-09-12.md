# Phase 5 gates — Admin D₂ (2026-09-12)



Writer: `E:\vsProjects\coolto\.codex-worktrees\prd-admin-analytics-d2`  

Branch: `codex/prd-admin-analytics-d2` @ `131f1bb` + local 5.0 slice (uncommitted)



## Local Docker (2026-09-12 evening)



| Project | Services | Host ports |

| --- | --- | --- |

| `cv-agent-be` (`cv-agent-app-be`) | api, postgres, redis, mailpit | **8080**, **15432**→5432, 6379, 8025 |

| `cv-agent-admin` (D₂ worktree) | api (air), redis | **8082**, 16382→redis |



Admin API needs `config/admin.config.json` (copied from `admin.config.example.json` if missing). Postgres URL default `host.docker.internal:15432` matches running BE stack.

**First-time DB (2026-09-12):** `CREATE DATABASE cv_analytics` on shared postgres; `docker compose --profile tools run --rm migrate up` + `migrate-analytics up`. Then `GET http://127.0.0.1:8082/health/live` → **ok**.



## Web (`web/`)



| Gate | Result |

| --- | --- |

| `npm run typecheck` | **PASS** |

| `npm run build` | **PASS** |



## Repo root (`make check` equivalent)



Windows: no `make` on PATH; steps from `Makefile` `check` via `docker compose run --rm --no-deps api …`.



**Hygiene fix (same session):** LF-normalize `scripts/*.sh`; `gofmt -w ./cmd ./internal` in container (CRLF bind-mount drift).



| Step | Result | Notes |

| --- | --- | --- |

| `gofmt -l` empty | **PASS** | After `gofmt -w` |

| `go vet ./...` | **PASS** | |

| `go build ./...` | **PASS** | |

| `sh scripts/check-file-lines.sh` | **PASS** | WARN only (8 files >220 lines, under 250 hard cap) |

| `docker compose config --quiet` | **PASS** | |

| prod compose config | **PASS** | |



**Overall `make check`:** **PASS** (equivalent).



| Extra | Result |

| --- | --- |

| `go test -race ./...` | **PASS** |



## Uncommitted hygiene in D₂ worktree



- `gofmt -w` may touch many `.go` files (line endings/format only).

- `config/admin.config.json` local copy (gitignored if listed — verify before commit).



## Still U



- Live D₁ handoff: `VITE_ADMIN_ANALYTICS_HANDOFF_BASE=http://127.0.0.1:8080` + token when BE exposes handoff routes.

- Admin `migrate` / `migrate-analytics` against shared postgres (run only when schema needed; see compose profiles).

- No commit/push unless user asks.


