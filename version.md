# Project Versioning
## Current Version: v1.8
**Release Date:** 2026-06-18

### v1.8 Changes
- **Trend Graphs Fix**: Fixed 'Traffic Heatmap' and 'BRAS Daily Distribution' to respect their intended 30-day and 7-day lookback periods regardless of the selected date range in the filter panel.
- **Custom Filters Stability**: Resolved `Substitution not set` crashes by implementing direct string interpolation with proper escaping for custom rule values, bypassing `@clickhouse/client` parameter substitution bugs.
- **Debug Enhanced**: Improved server-side debug logging to show exactly what is sent to ClickHouse.
- **SQL Optimization**: Cleaned up the `bras_daily` query logic in `queryService.js`.
