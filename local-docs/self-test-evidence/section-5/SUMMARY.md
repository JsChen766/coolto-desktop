# §5 跨平台安装与更新（必达）— 自测证据（2026-10-18 Asia/Shanghai）

## 验收项对照

| 验收项 | 现状 | 本轮改动 |
|--------|------|----------|
| README 给出 Win/mac 开发启动与最小运行步骤 | README「桌面开发与跨平台安装」覆盖 Win/mac/**Linux** 源码路径 | 是（文档） |
| 配置用户自备 API 后可完成 §1 或 §2 至少一条 | 指向 `oss-self-test-checklist` / `.env.example` / 设置→AI 接口 | 是（交叉引用） |
| 平台能力拒绝时有降级说明，不伪造成功 | README 降级表：通知 / 日历 / Linux keyring；代码侧既有 skip / permission_required | 是（文档；代码既有） |

## 非必达（明确不阻断）

- Authenticode / Apple 公证：runbook 可选
- 完整自动更新 infra：README 写明「开源版请自行管理版本」

## 抽查

```bash
rg -n "自行管理版本|package:win|Notification.isSupported|permission_required" README.md src/desktop/main/tracker/reminder-notification-scheduler.ts src/desktop/main/calendar/calendar-sync-service.ts
```

见 `readme-install-scan.log`。
