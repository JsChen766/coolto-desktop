# Phase 5 gap audit — Admin 13 sidebar pages vs D₁ handoff

Date: 2026-09-12  
Router source: `cv-agent-admin/web/src/router/index.ts` @ `131f1bb`  
Sidebar: `AdminLayout.vue` — **4 groups, 13 items** (plus `/app-settings` route not in sidebar).

Legend: **Legacy** = main DB + `cv_analytics` ETL (current production). **D₁** = Backend handoff projection (`/internal/admin/analytics/*`, OpenAPI `admin-analytics.yaml`). **5.0** = this slice.

| # | Route | View | Sidebar | Data source today | D₁ / Phase 5 gap |
| --- | --- | --- | --- | --- | --- |
| 1 | `/dashboard` | HomeView | 首页大盘 | `cv_analytics` + main reader | No handoff; cards/trends not tied to `CompactedAggregateSeed` |
| 2 | `/growth` | GrowthView | 增长分析 | Analytics snapshots + cohort SQL | No consent-aware D₁ cohorts; retention not from projection feed |
| 3 | `/usage` | UsageView | 产品使用 | `/api/dashboard/usage` (main DB) + **BFF** `/api/dashboard/usage-d1-snapshot` | **5.0+:** four-family panel via Admin BFF (fixture if handoff unset); legacy funnel/AI/sync still main DB |
| 4 | `/commercial` | CommercialView | 商业分析 | Main + analytics commercial metrics | No D₁ commercial aggregates (not in handoff contract) |
| 5 | `/users` | UserListView | 用户列表 | Main reader | No opaque projection refs; PII boundary unchanged |
| 6 | `/users/:id` | UserDetailView | (detail) | Main reader | Per-user AI usage still credit tables; not D₁ event facts |
| 7 | `/banned` | BannedListView | 封禁列表 | Main + audit | Operational; out of D₁ scope |
| 8 | `/unlimited` | UnlimitedListView | 不限量用户 | Main + settings | Operational; out of D₁ scope |
| 9 | `/orders` | OrderListView | 订单查询 | Main | Operational; out of D₁ scope |
| 10 | `/abnormal-orders` | AbnormalQueueView | 异常单队列 | Main | Operational; out of D₁ scope |
| 11 | `/orders/:id` | OrderDetailView | (detail) | Main | Operational; out of D₁ scope |
| 12 | `/audit` | AuditLogView | 审计日志 | Admin schema | Operational; out of D₁ scope |
| 13 | `/admins` | AdminAccountsView | 管理员账号 | Admin schema | Operational; out of D₁ scope |
| — | `/pipeline` | PipelineStatusView | 数据管道状态 | Analytics ETL metadata + **BFF** `/api/dashboard/d1-governance` + `/d1-feed` | **5.0+:** D₁ health panel (fixture if handoff unset); ETL cards still main analytics DB |
| — | `/system-config` | SystemConfigView | 系统配置 | Business config | May need handoff token rotation UI (Phase 3 theme) |
| — | `/app-settings` | AppSettingsView | (hidden) | `app_settings` | Unrelated to D₁ product analytics |

## Summary counts

| Category | Pages |
| --- | --- |
| Sidebar analytics (D₁ target) | 4 (`dashboard`, `growth`, `usage`, `commercial`) |
| **5.0 touched** | 2 (`usage` partial, `pipeline` D₁ health) |
| User / order / system (legacy OK) | 9+ detail routes |
| **Critical gap** | 3 analytics pages still 100% legacy (home/growth/commercial); live D₁ empty of product events |

## D₁ contract families (reference)

`metricFamily`: `event`, `funnel`, `resume`, `task`, `browser`, `application` (`admin-analytics.yaml`).  
5.0 displays **resume / application / browser / task** on Usage only; activation funnel (`funnel|activation|*`) remains on legacy block until a later slice.
