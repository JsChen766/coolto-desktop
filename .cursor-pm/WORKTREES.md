# PRD program — serial worktree layout (Cursor PM authority)

Updated: 2026-09-12 Asia/Hong_Kong

This file is the **code/worktree authority** for step-by-step delivery. `.cursor-pm/PROGRAM.md` tracks phase status; `.codex-pm/` is historical audit only.

## Rules

1. **One writer at a time** on App product bytes. No parallel OMP on MAT + PRO/PREF + shared host.
2. **Primary checkout** `cv-agent-app` (`codex/browser-enhance-be0-be5`) stays the user's Browser/Markdown sandbox — **not** the PRD implementation line.
3. **Integration trunk** holds the last independently accepted App snapshot. Feature work happens in a **step worktree**, then merges into the trunk via `scripts/prd-copy-worktree-paths.mjs`.
4. Do not delete a worktree until its paths are merged or explicitly abandoned (see inventory).
5. No `commit` / `push` unless the user authorizes.

## App — serial pipeline

```
e2663e1 (origin/app)
    │
    ▼  [frozen] F1–F3 accepted in manifests
prd-privacy  ─────────────────────────────►  INTEGRATION TRUNK (480 paths, Phase 4 merged 2026-09-12)
    ▲                                              │
    │ Step 1 MAT                                   │
    ▼                                              │
prd-material-product-takeover  ────────────────────┘
    │
    │ Step 2 PRO/PREF (only after trunk includes MAT)
    ▼
prd-profile-pref-app-takeover  ───────► merged → trunk (read-only reference)
    │
    │ Step 3 App closure
    ▼
prd-app-closure  ───────────────────► read-only reference (bytes match trunk SHA)
```

| Role | Path | Edit? |
| --- | --- | --- |
| User | `E:/vsProjects/coolto/cv-agent-app` | User only |
| **Integration trunk** | `.codex-worktrees/prd-privacy` | **Phase 4 closure** — **480 paths**, gate authority (2026-09-12 post-merge) |
| **Phase 1 reference** | `.codex-worktrees/prd-material-product-takeover` | Read-only; bytes match trunk |
| **Phase 2 — PRO/PREF** | `.codex-worktrees/prd-profile-pref-app-takeover` | Read-only reference |
| **Phase 4 — closure reference** | `.codex-worktrees/prd-app-closure` | Read-only (480-path manifest match) |
| Evidence | `prd-integration`, `prd-del-form` | No |

Merge helper: `scripts/prd-copy-worktree-paths.mjs` (`--write-manifest`, `--inventory-only`)  
Post-merge manifest: `node scripts/prd-worktree-manifest.mjs --repo <trunk> --out .cursor-pm/evidence/phase-4-trunk-post-merge-manifest.json`  
Inventory: `node scripts/prd-worktree-inventory.mjs`  
Local API Docker: **only** `E:/vsProjects/coolto/cv-agent-be` — see `.cursor-pm/DOCKER.md`

### Phase 2 — old `prd-profile-pref-app` seven paths

Historical list only; **2026-09-11 reconcile skipped** (stale vs current takeover). Binding lives at `src/resume/workspace/profile-preference-binding.ts`. Retire old worktree after Phase 2 merge.

## Backend (separate repo under `.codex-worktrees`)

| Role | Path | Edit? |
| --- | --- | --- |
| ACCEPT reference | `prd-backend-shared-integration` | No |
| Phase 3 D₁ (be) | `prd-admin-analytics-handback-be` | Yes (handback); merge to canonical be when approved |

## Admin (`cv-agent-admin` under `.codex-worktrees`)

| Role | Path | Branch | Edit? |
| --- | --- | --- | --- |
| Primary (user) | `E:/vsProjects/coolto/cv-agent-admin` | `admin` @ `131f1bb` | User / read reference |
| **Phase 5 writer** | `prd-admin-analytics-d2` | `codex/prd-admin-analytics-d2` | **Yes** — Admin UI + D₁ consumption |

Merge Admin writer → **`admin`** via **GitHub PR** only (no `prd-copy-worktree-paths` from App trunk).
OpenAPI authority for handoff types: `prd-admin-analytics-handback-be/api/openapi/`.

## Phase 0 removals

Documented in `evidence/phase-0-2026-09-11.md`. Batch-1 slice trees removed after inventory snapshot; core/evidence/trunk/takeover trees retained.
