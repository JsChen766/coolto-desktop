# Phase 5 entry — Admin UI + D₁ handoff (5.0)

Date: 2026-09-12  
PM sandbox: `E:\vsProjects\coolto\cv-agent-app` (evidence only; no App bytes)  
Admin writer: `E:\vsProjects\coolto\.codex-worktrees\prd-admin-analytics-d2`

## Authority

| Item | Value |
| --- | --- |
| Admin primary | `E:\vsProjects\coolto\cv-agent-admin` @ `admin` → `131f1bb` (read-only reference checkout) |
| D₂ worktree | `E:\vsProjects\coolto\.codex-worktrees\prd-admin-analytics-d2` |
| D₂ branch | `codex/prd-admin-analytics-d2` (created from `131f1bb`; cannot attach second worktree to `admin` while primary holds it) |
| D₁ OpenAPI | `E:\vsProjects\coolto\.codex-worktrees\prd-admin-analytics-handback-be\api\openapi\` |
| App integration trunk | `prd-privacy` — **not edited** this phase |
| Merge policy | Admin changes land via **PR → `admin`**; no path-copy from App trunk |

## Structure adaptation (vs Grok plan)

- **Worktree branch name:** plan said “from admin branch”; git requires a distinct branch name when `admin` is checked out in `cv-agent-admin`. Writer branch is `codex/prd-admin-analytics-d2` at the same commit as `admin`.
- **Handoff HTTP:** D₁ routes live on **cv-agent-be** at `/internal/admin/analytics/*` (service audience `admin-analytics`). Admin Go API has **no** BFF proxy yet; 5.0 slice calls handoff from the **web** layer with env overrides or **synthetic fixture** when `VITE_ADMIN_ANALYTICS_HANDOFF_BASE` is unset.
- **`make check`:** requires Docker + `make` on PATH; this host had **Docker Desktop stopped** and **no `make`** — gates documented in `phase-5-gates-2026-09-12.md` (web gates run locally).

## 5.0 vertical slice (code)

**Product Usage — D₁ funnel four families (read-only):** `resume`, `application`, `browser`, `task`.

| Path | Role |
| --- | --- |
| `web/src/api/admin-analytics-handoff.ts` | Snapshot client + types |
| `web/src/fixtures/admin-analytics-usage-funnel.ts` | Synthetic `compactedAggregateSeed` when no handoff base |
| `web/src/lib/admin-analytics/usage-funnel-families.ts` | Seed → panel/chart model |
| `web/src/views/dashboard/UsageD1FunnelPanel.vue` | Four-family UI (`AdminChart`, design tokens) |
| `web/src/views/dashboard/UsageView.vue` | Embeds D₁ panel above legacy `/dashboard/usage` blocks |

Env (optional live handoff):

- `VITE_ADMIN_ANALYTICS_HANDOFF_BASE` — e.g. `http://localhost:8080` (be API root, no `/api` prefix)
- `VITE_ADMIN_ANALYTICS_HANDOFF_TOKEN` — Bearer for service auth
- `VITE_ADMIN_ANALYTICS_FIXTURE=1` — force fixture even if base is set

Growth / Pipeline pages unchanged.

## Dirty summary (D₂, 2026-09-12)

| Status | Path |
| --- | --- |
| M | `web/src/views/dashboard/UsageView.vue` |
| A | `web/src/api/admin-analytics-handoff.ts` |
| A | `web/src/fixtures/admin-analytics-usage-funnel.ts` |
| A | `web/src/lib/admin-analytics/usage-funnel-families.ts` |
| A | `web/src/views/dashboard/UsageD1FunnelPanel.vue` |

`web/node_modules/` and `web/dist/` from local `npm install` / `npm run build` — not committed.

## Next (5.0+)

1. Admin BFF proxy + auth for handoff (avoid browser → be direct).
2. Wire live snapshot when Docker handback stack available.
3. Gap closure per `phase-5-gap-13-pages.md`.
4. PR `codex/prd-admin-analytics-d2` → `admin` when user approves.
