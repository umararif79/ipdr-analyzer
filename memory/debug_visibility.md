---
name: ipdr_debug_visibility
description: Implementation of SQL query preview in UI
type: project
---
Added a `query-preview` element to the filter section of the UI that displays the generated SQL `WHERE` clause and parameters returned by the API.
**Why:** To allow users and developers to verify the exact queries being sent to ClickHouse without checking server logs.
**How to apply:** API must return `debugSql` in the JSON response, and frontend must map this to the `#query-preview` element.
