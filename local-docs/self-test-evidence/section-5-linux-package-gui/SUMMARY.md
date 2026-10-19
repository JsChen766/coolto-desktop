# §5 Linux 正式包 / unpacked 冷启动 GUI — 证据（2026-10-19 Asia/Shanghai）

对照既有 `section-5/`（builder 冒烟）加深：**unpacked 冷启动**、原生哈希与 keyring 根因、workaround。

## 分项结论

| 项 | 结论 |
|----|------|
| `npm run package:linux` builder | **PASS**（EXIT 0） |
| 产物 | **PASS**：`dist-electron/Coolto-0.1.27-x86_64.AppImage`（~227M）、`dist-electron/linux-unpacked/coolto-local-agent` |
| unpacked 冷启动（修前基线） | **FAIL**：主进程 Uncaught `正式包缺少原生保护模块哈希` + `系统安全存储不可用` |
| unpacked 冷启动（修后，无 env） | **BLOCKED(keyring)**：原生哈希已消除；仍 `系统安全存储不可用`（无 gnome-keyring/libsecret + 无系统 bus） |
| unpacked 冷启动（修后 + workaround env） | **PASS**：`COOLTO_ALLOW_PLAINTEXT_SAFE_STORAGE=1` → CDP `title=Coolto`，`events.jsonl` `app_start` `packaged:true` |
| 开发态 workaround | **可用**：`npm run desktop:dev` / `desktop:dev:cdp`（未打包路径本就跳过 Linux 原生模块，并自动 plaintext safeStorage） |

无 deb 产物：`electron-builder.yml` linux target 仅 `AppImage`。

## 命令

```bash
# 1) Builder
npm run package:linux
# = desktop:build && electron-builder --linux AppImage --x64

# 2) 修前/对照基线（旧 asar 或无修复时）
./dist-electron/linux-unpacked/coolto-local-agent --user-data-dir=… --no-sandbox
# → 正式包缺少原生保护模块哈希

# 3) 修后 + box 冒烟 workaround
COOLTO_ALLOW_PLAINTEXT_SAFE_STORAGE=1 \
  ./dist-electron/linux-unpacked/coolto-local-agent \
  --user-data-dir=… --no-sandbox --remote-debugging-port=9333
# curl http://127.0.0.1:9333/json/list → title Coolto
```

日志：`package-linux-rebuild.log`、`unpacked-cold-start-*.log`、`cdp-json-*.sanitized.md`、`diagnostics-snippet/events-app-start.md`。

## 根因

### 1) 正式包缺少原生保护模块哈希

- `initializeNativeProtection()` 在 `app.isPackaged` 时要求 `__COOLTO_NATIVE_CORE_SHA256__` 非空并对 `resources/native/coolto-core.node` 做校验。
- **Linux 从未提供 coolto-core**：`scripts/build-native-core.mjs` 仅 `win-x64` / `mac-universal`；`electron-builder.yml` 的 `linux` 段无 `extraResources` 拷贝 `.node`；`package:linux` 走 `desktop:build`（非 `desktop:build:protected`）。
- 构建机为 Linux 时，`electron.vite.config.ts` 只认 win/darwin artifact 路径 → 编译期哈希为 `""` → 正式包启动即抛错。
- **修复（本轮）**：绑定文件不存在则直接 return（与「OSS Linux 不带原生保护模块」一致），不再因空哈希崩溃。

### 2) 系统安全存储不可用（keyring）

- Electron `safeStorage` 依赖 libsecret / gnome-keyring；本 box 无可用会话密钥环，且 `/run/dbus/system_bus_socket` 不存在。
- 旧逻辑：仅 `!app.isPackaged` 时 `setUsePlainTextEncryption(true)`；**正式包**不能自动降级 → 登录态保存失败。
- **Workaround（本轮）**：正式包可显式设 `COOLTO_ALLOW_PLAINTEXT_SAFE_STORAGE=1`（仅 CI/box 冒烟；**禁止**当生产默认）。未打包开发态仍自动 plaintext。
- 真机 Linux 桌面：安装/启用 secret service（gnome-keyring 等）后可不设该 env。

## 产物路径（本轮重建时间 2026-10-19 18:26 CST）

- `dist-electron/Coolto-0.1.27-x86_64.AppImage`
- `dist-electron/linux-unpacked/coolto-local-agent`
- `dist-electron/linux-unpacked/resources/app.asar`（无 `resources/native/coolto-core.node`，属预期）

## 代码改动

- `src/desktop/main/native-protection.ts` — 缺绑定则跳过
- `src/desktop/main/index.ts` — 正式包允许 env 开启 plaintext safeStorage

## 总评

**PASS(builder)** + **PASS(unpacked GUI cold-start with documented env workaround)**；无 env 时 keyring 仍 **BLOCKED**（环境限制，非 builder 失败）。生产 Linux 应使用系统 keyring，勿默认打开 plaintext env。
