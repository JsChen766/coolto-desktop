# Local Docker (serial program)

**Only one backend stack for App manual testing:**

```powershell
# App 手测（隐私门 / Profile / Preference）需要带 privacy 模块的后端：
cd E:\vsProjects\coolto\.codex-worktrees\prd-privacy-be
docker compose up -d --build
docker compose --profile tools run --rm migrate up

# 仅改 Go 业务、不需要隐私 API 时可用主 checkout：
# cd E:\vsProjects\coolto\cv-agent-be && docker compose up -d --build
```

- API: `http://127.0.0.1:8080` (`/health/live`, `/health/ready`)
- Mailpit UI: `http://127.0.0.1:8025` (OTP / dev login email)
- Postgres host port: default `5432` (or `POSTGRES_PORT` from `.env`)

App worktree (Phase 2): set `COOLTO_API_BASE_URL=http://127.0.0.1:8080` in `.env`.

**Dev login (no real email):** seed account + password login into Electron session:

```powershell
cd E:\vsProjects\coolto\.codex-worktrees\prd-privacy-be
docker compose --profile tools run --rm -e GOOSE_TABLE=goose_db_version_dev -e GOOSE_MIGRATION_DIR=migrations-dev migrate up

cd E:\vsProjects\coolto\.codex-worktrees\prd-profile-pref-app-takeover
node scripts/run-dev-desktop-login.mjs
npm run desktop:dev
```

Account: `dev@example.com` / `devpassword` (local only). OTP UI still works via Mailpit: http://127.0.0.1:8025

## Phase 5 local D₁ live snapshot

Current App-manual BE for this slice is the **handback overlay** (same project name `cv-agent-app-be`, remounts D₁ tree; `POSTGRES_PORT=15432`):

```powershell
cd E:\vsProjects\coolto\.codex-worktrees\prd-admin-analytics-handback-be
docker compose up -d
cd E:\vsProjects\coolto\.codex-worktrees\prd-admin-analytics-d2
docker compose up -d
```

Handoff secrets stay in gitignored `.env`. Production compose defaults remain `ANALYTICS_HANDOFF_ENABLED=false`. Overlay pins `PRIVACY_ENFORCEMENT_ENABLED=false`. Evidence: `evidence/phase-5-live-snapshot-2026-09-13.md`.

## Do not

- Run `docker compose up` inside unrelated `.codex-worktrees/*-be` slices. **Exception:** `prd-admin-analytics-handback-be` is the D₁ overlay for the shared `cv-agent-app-be` project (see Phase 5 above).
- Run `migrate up` from **handback** worktree against the live `cv-agent-app-be` project while **privacy-be** owns that DB — goose can disagree on `00016`. Use `scripts/run-analytics-handback-db-acceptance.py` (isolated project) for D₁ gates instead.
- Spin per-slice stacks (`profile-pref-acceptance`, `pri-health`, …); removed 2026-09-11.

## Other compose projects on this machine

- `cv-agent-api-service` — LLM gateway (`:3000`), separate product; not part of App PRO/PREF smoke.
- Unrelated projects (`money`, `freqtrade`, …) — untouched.

## Leftover volumes (optional manual prune)

After removing multi-agent stacks, Docker may still list unused volumes such as
`pri-privacy-empty_*`, `backend-admin-analytics-handback-v1_*`, `coolto_web_login_fix_*`.
They are safe to delete if you no longer need that old DB data:

```powershell
docker volume ls
docker volume rm <name>   # one at a time, or prune only names you recognize
```
