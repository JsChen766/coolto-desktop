# Phase 4 — C1 MaterialHostPort wiring

Date: 2026-09-12  
Worktree: `E:\vsProjects\coolto\.codex-worktrees\prd-app-closure` (`codex/prd-app-closure`)

## Done

- `openMaterialUserHost()` — encrypted repo, import/OCR/proposals, core host + desktop IPC deps.
- `createExperienceMaterialRelationCommitPort()` — material relation approve → Experience proposal + outbox.
- `UserServices.material` (`host` + `ipc`); lifecycle `close()` in `clear-user-services` (optional for test mocks).
- Main window: `registerAppMaterialIpc` + file dialogs; `MATERIAL_IPC_CHANNELS` in IPC teardown list.
- Preload: `coolto.material` via `materialPreloadApi`; `DesktopApi.material` typed.
- Agent: `materialHost` on `AgentContextFactoryDependencies` → `list_materials` / relation tools via `experience-tool-registry`.
- Demo / unavailable desktop API stubs for `material`.

## Gates

| Gate | Result |
| --- | --- |
| `npm run check` | **PASS** 2026-09-12 (2nd run; 1st hit flaky `material-product-root-lock` on Windows) |
| `npm run test` | **PASS** 1513 pass / 2 skip |
| `node scripts/run-material-product-acceptance.mjs` | **PASS** 2026-09-12（closure 本地 `npm install` 后；`MAT_PRODUCT_ELECTRON_ACCEPT` marker） |

## UI

- `MaterialLibraryView` already in `AppMainWorkspace`; reads `window.coolto.material` — should show live API after login (manual: open 材料库, import/OCR/relation).

## Next (C2)

- MAIL / INTERVIEW / SITE / CTX integration per `phase-4-entry-2026-09-12.md`.
- Re-run MAT acceptance after `tesseract.js` path available in closure worktree `node_modules`.
- Phase 2 deferred manual batch on integrated host.
