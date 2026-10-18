# GUI: desktop:dev + smoke:desktop-chat

- Date: 2026-10-18 (Asia/Shanghai)
- Started: `npm run desktop:dev -- --remote-debugging-port=9222` (background; DISPLAY=:4)
- CDP: DevTools listening on `ws://127.0.0.1:9222/...` — **yes**
- Renderer vite: `http://localhost:5173/` HTTP 200

## smoke:desktop-chat

- Command: `npm run smoke:desktop-chat -- --new-chat --message "回复 OK"`
- Exit: **1**
- Error: `No Coolto CDP page target at http://127.0.0.1:9222 within 60000ms`
- CDP `/json/list` showed one `page` target with **empty** `title` and `url` (smoke requires `title === "Coolto"` and Coolto renderer URL)
- App log notes: `electron-updater` `TypeError: Invalid URL` during `setFeedURL` (UnhandledPromiseRejection); dbus noise

## Screenshots

Not captured. (Even if captured, `local-docs/**/*.png` is gitignored.)

## Verdict

**PARTIAL**: desktop:dev + CDP port up; chat smoke **did not** find a Coolto page target. Process left running in background for optional inspection.
