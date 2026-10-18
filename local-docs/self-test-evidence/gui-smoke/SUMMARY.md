# GUI smoke: desktop:dev:cdp + smoke:desktop-chat

- Date: 2026-10-18 21:36 CST (Asia/Shanghai)
- HEAD at start: `c4127d2`
- Command start: `npm run desktop:dev:cdp` (background; `DISPLAY=:4`)
- Node: 22 via nvm; `unset NPM_CONFIG_PREFIX`

## CDP

- DevTools listening on `ws://127.0.0.1:9222/...` — **yes**
- Renderer vite: `http://localhost:5173/` HTTP 200
- `/json/list` (sanitized): see `cdp-json-list.sanitized.json`
  - page `title=Coolto`, `url=http://localhost:5173/`

## smoke:desktop-chat

- Command: `npm run smoke:desktop-chat -- --new-chat --message "回复 OK"`
- Exit: **0**
- Result: `success: true`, `finalResponse: "OK"`, `durationMs: 2085`
- Log: `smoke-desktop-chat.log`

## Bootstrap notes (this environment)

1. **Empty CDP page** on earlier runs: main loaded renderer *after* heavy IPC wiring; reorder `loadURL` before IPC in `src/desktop/main/index.ts`.
2. **Privacy gate / safeStorage**: box has no gnome-keyring/libsecret; unpackaged Linux now calls `safeStorage.setUsePlainTextEncryption(true)` when encryption unavailable.
3. **Empty update feed**: skip `setFeedURL` when `COOLTO_UPDATE_FEED_URL` is empty (`electron-updater-driver.ts`).
4. **Missing `user_profile`** on OSS offline sync: seed empty local profile in `ProfileSyncStore.ensureLocalEmptyProfile()`.
5. First-run onboarding was already skipped in this userData; new-chat was enabled.

## Screenshots

Not committed (`local-docs/**/*.png` gitignored). Window was mapped (`Coolto` IsViewable on `DISPLAY=:4`).

## Verdict

**PASS**: `desktop:dev:cdp` + CDP Coolto page + `smoke:desktop-chat` green.
