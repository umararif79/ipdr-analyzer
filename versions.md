# Project Versions

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
