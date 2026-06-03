# Project Versions

## v1.6 (2026-05-25)
### New Features
- **Alert/Warrant System**: Implementation of monitoring rules (warrants) to trigger alerts when specific traffic patterns (e.g., specific IP or Application) are detected in ClickHouse logs.
- **Active Alerting**: Real-time alert notifications on the dashboard with the ability to resolve and manage alerts.
- **Admin Warrant Management**: Full CRUD interface for monitoring warrants and system-wide alert clearing.

## v1.5 (2026-05-25)
... (rest of the file)

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
