---
name: ipdr_performance_optimizations
description: Details on API query and pagination optimizations for ClickHouse
type: project
---
Implemented optimization for the `/api/query` endpoint to only perform `SELECT count()` on the first page (offset 0). 
**Why:** Full table scans for total record counts were causing high latency (40s+) on large datasets.
**How to apply:** Use conditional count queries based on pagination offset to reduce ClickHouse load.
