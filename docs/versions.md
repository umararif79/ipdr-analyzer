# Project Versions

# Project Versioning
## Current Version: v1.10
**Release Date:** 2026-06-20

### v1.10 Changes
- **BRAS UI Polish**: Updated the BRAS Management interface to fully adhere to the enterprise design system.
- **Table Enhancements**: Added center-alignment for serial numbers and a dynamic record count footer.
- **Visual Styling**: Implemented custom CSS for CIDR meta-chips with themed blue accents for better visual distinction.
- **Code Cleanup**: Refactored `bras-list.html` to remove inline styles and improve maintainability.

### v1.9 Changes
- **Dashboard Decoupling**: Moved all analytics graphs and rank widgets to a dedicated `dashboard.html` page for better performance and clarity.
- **URL-Based Sync**: Implemented filter synchronization between the records view and dashboard via URL parameters.
- **BRAS Analytics Upgrade**: 
  - Upgraded BRAS daily distribution to a stacked bar chart.
  - Added "Inactive BRAS" monitoring and highlighting for devices without data in the last 7 days.
- **API Modularity**: Split the monolithic `/api/stats` call into dedicated granular endpoints (`/api/stats/bras-distribution`, etc.) to prevent complex queries from blocking the UI.
- **Stability**: Fixed BRAS chart rendering and resolved server crashes (Access Violation) on Windows.

### v1.8 Changes
- **Trend Graphs Fix**: Fixed 'Traffic Heatmap' and 'BRAS Daily Distribution' to respect their intended 30-day and 7-day lookback periods regardless of the selected date range in the filter panel.
- **Custom Filters Stability**: Resolved `Substitution not set` crashes by implementing direct string interpolation with proper escaping for custom rule values, bypassing `@clickhouse/client` parameter substitution bugs.
- **Debug Enhanced**: Improved server-side debug logging to show exactly what is sent to ClickHouse.
- **SQL Optimization**: Cleaned up the `bras_daily` query logic in `queryService.js`.


## v1.7 (2026-05-30)
### New Features
- **Service-Oriented Architecture**: Backend refactored into specialized services (`connectionService`, `queryService`, `auditService`, `monitoringService`, `notificationService`, `validationService`) for improved maintainability and scalability.
- **User Personalization**: Added support for favorite filter sets and individual UI preferences (dashboard layout).
- **Health Monitoring**: Integrated `/api/health` endpoint to verify connectivity of all assigned ClickHouse clusters.
- **Enhanced Governance**: Implemented complete audit trails for all administrative actions (CREATE, UPDATE, DELETE).
- **Real-time Alerting**: Added notification provider support for Telegram and Slack to deliver warrant-triggered alerts.
- **Related Logs**: New `/api/related` endpoint to retrieve temporally and spatially related logs across authorized connections.

### Fixes & Improvements
- **Monitoring Stability**: Resolved crashes in `runAnomalyDetection` and `runWarrantMonitor` by adding the missing `fingerprint` column to the `alerts` table.
- **Column API Format**: Fixed `/api/columns` to return a flat array of objects instead of Map entries, resolving "undefined" labels and empty checkbox lists in UI Settings.
- **Stats API Reliability**: Resolved transient "Too many parameter values" errors and added enhanced stack-trace logging for better diagnostics.
- **Query Parameterization**: Improved ClickHouse parameter handling to prevent substitution errors.
- **Request Validation**: Integrated `express-validator` with schema-based validation for all critical API endpoints.
- **Token Management**: Enhanced JWT role-based access control (RBAC) to support 'manager' and 'auditor' roles.

## v1.6 (2026-05-25)
### New Features
- **Alert/Warrant System**: Implementation of monitoring rules (warrants) to trigger alerts when specific traffic patterns (e.g., specific IP or Application) are detected in ClickHouse logs.
- **Active Alerting**: Real-time alert notifications on the dashboard with the ability to resolve and manage alerts.
- **Admin Warrant Management**: Full CRUD interface for monitoring warrants and system-wide alert clearing.

## v1.5 (2026-05-25)
### Fixes & Improvements
- **UI Alignment**: Fixed sizing and alignment of Trend and Heatmap charts, adding a scrollable wrapper to keep the layout linear.
- **Trend Comparison**: Fixed logic to correctly compare the current selected date range against the preceding period of equal duration.
- **Heatmap Filtering**: Integrated active user filters into the Heatmap query, ensuring data consistency across widgets.

## v1.4 (2026-05-19)
### Fixes & Improvements
- **Production Routing**: Moved the catch-all route to the end of the server configuration to prevent API endpoints from being intercepted.
- **Login Flow**: Added the missing `/login` route in production to fix the redirect loop between the home page and login page.
- **File Paths**: Updated production server to serve `login.html` and `api-docs.html` from the `dist/` directory.
- **Syntax Fix**: Corrected a syntax error in `cachedColumns.get()` where a square bracket was used instead of a parenthesis.
- **Security**: Added `crypto.js` for AES-256-GCM encryption of sensitive data.
- **UI Updates**: Enhanced the main dashboard with animated rank widgets and improved layout.
- **General**: Cleaned up production server build and deployment configuration.
