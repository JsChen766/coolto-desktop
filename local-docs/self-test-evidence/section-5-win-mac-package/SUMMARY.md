# §5 Win/Mac 打包边界 — 证据（2026-10-19 Asia/Shanghai）

box 为 **Linux**；无法真机安装/公证。本轮目标：查清脚本与配置、在 box 上冒烟到明确阻断点，并只读核对本机 Windows 仓库——**不宣称 Win/Mac 安装成功**。

## 分项结论

| 平台 / 路径 | 状态 | 冒烟到哪 | 阻断原因 |
|-------------|------|----------|----------|
| **Windows `package:win` 全链** | **deferred**（完整成功需 Windows） | box：`native:build:win` 主机门禁 exit 1；跳过 native 后 `electron-builder --win nsis --x64` 可装 Electron win 并写出 `win-unpacked/`，**NSIS 失败于 `spawn wine ENOENT`** | ① `native:build:win` 必须 `win32/x64`；② 缺 `coolto-core.win32-x64-msvc.node`；③ box 无 wine，无法完成 NSIS；④ `verify:installer:win` 硬性 `process.platform === "win32"` |
| **Windows 真机安装/校验** | **deferred** | 本机 `d90de375-…` **只读探测**：脚本/配置存在；**未**跑 `package:win` | 避免擅自拉起原生构建/安装器审批；本地 checkout 亦无 native artifacts |
| **macOS `package:mac` / `package:mac:dmg`** | **deferred** | box：`native:build:mac` 主机门禁 exit 1；`electron-builder --mac --dir --universal` 可下 darwin electron 临时目录，universal 合并失败 | ① native 必须 `darwin/arm64`；② 缺 `coolto-core.darwin-universal.node`；③ `@electron/universal is only supported on darwin platforms` |
| **macOS 公证 / 真机** | **deferred** | 配置有 `identity: "-"`、entitlements、signIgnore；Mac 机 ListMachines=`connected:false` | 需 macOS +（可选）Developer ID / 公证；开源非必达 |

**对照**：Linux `package:linux` 已在 `section-5-linux-package-gui/` **PASS(builder + GUI workaround)**。

## 命令（可复现）

```bash
# 主机门禁（Linux box → 预期失败）
npm run native:build:win
# Error: Native win-x64 must build on win32/x64; current host is linux/x64  (exit 1)
npm run native:build:mac
# Error: Native mac-universal must build on darwin/arm64; … (exit 1)

# 跨平台 builder 冒烟（跳过 native/protected；--publish never）
npx electron-builder --win nsis --x64 --publish never
# … packaging win-unpacked … → ⨯ wine process failed ENOENT  (exit 1)

npx electron-builder --mac --dir --universal --publish never
# … packaging darwin x64/arm64 temps … → ⨯ @electron/universal is only supported on darwin platforms  (exit 1)
```

日志：`native-build-host-gate.log`、`native-build-exit-codes.log`、`electron-builder-cross-attempt.log`、`config-inventory.log`、`host-cross-tools.log`、`win-machine-readonly-probe.log`。

## 脚本与配置清单（存在即声明）

| 脚本 | 作用 |
|------|------|
| `package:win` | `native:build:win` → `desktop:build:protected` → `electron-builder --win nsis --x64` → `verify:release:win` → `verify:installer:win` |
| `package:mac` | `native:build:mac` → `desktop:build:protected` → `electron-builder --mac --dir --universal` → `verify:release:mac` |
| `package:mac:dmg` | 同上但 `--mac --universal`（含 dmg） |
| `native:build:win` / `:mac` | `scripts/build-native-core.mjs`；**强制本机 OS** |
| `verify:release:win` / `:mac` | `scripts/verify-release-hardening.mjs` 对 unpacked / `.app` |
| `verify:installer:win` | `scripts/verify-windows-installer.mjs`；**开头即要求 win32** |

`electron-builder.yml`：`win.target=nsis` + win32 coolto-core extraResources；`mac` universal dir/zip/dmg + darwin coolto-core + entitlements + `identity: "-"`。

本机 Windows 只读（`E:\vsProjects\coolto\coolto-desktop-local`，HEAD `03bf676`，branch `dev/app-complete`）：上述脚本键存在；`native/coolto-core/artifacts` **ABSENT**；Apple Mac 机离线。

## 诚实边界

- box 上出现的 `dist-electron/win-unpacked/` 或部分 `.exe` **不等于** 可发布的 Win 安装包（缺 coolto-core、NSIS/wine 失败、未跑 verify）。
- 未在 Windows 本机执行 `package:win`（高成本/需审批）；完整 PASS 仍标 **deferred**。
- Authenticode / Apple 公证：maintainer 可选，见 `local-docs/desktop-release-hardening-runbook.md`。

## 总评

**配置与脚本齐备；Linux box 已冒烟到 OS/工具链硬阻断；Win/Mac 完整打包与安装 = deferred。** 未伪造成功。
