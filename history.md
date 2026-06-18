# Project History

## v1.8 (2026-06-18)
- **Bug Fixes**: 
  - Resolved `Sustitution not set` error in custom filters by switching from named parameters to safe string interpolation.
  - Fixed trend graphs (Heatmap and BRAS Daily) to stop being overridden by the search date range, restoring their 30-day and 7-day lookback intervals.
- **Features**:
  - Enhanced SQL debug logging in the terminal for precise execution monitoring.
  - Refactored `buildWhereClause` to support conditional date exclusion for trend queries.

## v1.7 (Enterprise Upgrades & Stability)
- Enterprise upgrades and general stability fixes.

## v1.6 (Warrant & Alert System)
- Implementation of the complete warrant and alert system.

## v1.5 (UI Alignment & Dynamic Filtering)
- UI alignment fixes for trend/heatmap and implementation of dynamic widget filtering.

## v1.4 (Foundation & Encryption)
- Core routing corrections and implementation of password encryption.
