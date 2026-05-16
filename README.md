IPDR Log Analyzer - Project Documentation
1. Overview
The IPDR Log Analyzer is a professional web-based tool designed to query, filter, and analyze large-scale network logs stored in ClickHouse. It provides a user-friendly interface to search through parsed logs, visualize traffic patterns via a dashboard, and manage multiple ClickHouse connections with role-based access control.

Core Objectives
High-Performance Querying: Leverage ClickHouse's speed to query millions of records with efficient pagination and sorting.
Dynamic Filtering: Provide a flexible filtering system that adapts to the columns available in the database view.
Multi-Connection Management: Allow administrators to configure multiple database sources and assign them to specific users.
Traffic Insights: Generate real-time statistics on protocol distribution, top destinations, and hourly traffic.
2. Architecture
The project follows a classic Client-Server architecture.

Tech Stack
Frontend: Vanilla JavaScript (ES6+), HTML5, CSS3.
Backend: Node.js with Express.js.
Primary Database (Logs): ClickHouse (accessed via @clickhouse/client).
Local Database (Config/Auth): SQLite (via better-sqlite3).
Authentication: JSON Web Tokens (JWT) for secure session management.
Data Flow
User Browser 
→
 Express API 
→
 SQLite (Auth/Config) 
→
 ClickHouse (Log Data) 
→
 Response 
→
 UI

3. Database Design
Local SQLite Database (localdb.js)
Stores application configuration and user accounts.

users: Stores user credentials (hashed passwords), roles (admin/user), and profile info.
connections: Stores ClickHouse connection details (host, username, password, database).
user_connections: A mapping table that assigns specific ClickHouse connections to specific users.
system_settings: Key-value store for global application behavior (e.g., debug_mode).
ClickHouse Storage
The application interacts with a specific view: view_parsed_logs.

Expected Columns: Includes log_date (Date), log_datetime (DateTime64), src_ip, dest_ip, proto, src_port, dest_port, and others.
Optimization: The application uses log_date for partition pruning to ensure queries remain fast even as data grows.
4. Key Features & Implementation
Dynamic Filter System
The system uses a "Logical-to-Physical" column mapping (COLUMN_MAP in server.js) to bridge the gap between user-friendly UI labels and actual database column names.

Known Filters: Hardcoded common fields (IPs, Ports, Protocol) that appear if a match is found in the table schema.
Custom Column Filter: Allows users to select any column from the table and apply an exact match filter.
Date Bounds: The UI automatically manages dateFrom and dateTo, ensuring that queries are always bounded to a specific time range to prevent full-table scans.
Period Selector
Provides quick-access time ranges:

Today: From midnight today until now.
Yesterday: Full 24-hour window for the previous day.
Last Week: From 7 days ago until now.
Admin Panel
A secure area for administrators to:

Manage Connections: Add, edit, or delete ClickHouse database connections.
Manage Users: Create users and assign them access to specific database connections.
System Settings: Toggle "Debug SQL Preview" to show generated queries on the main UI for troubleshooting.
Dashboard & Stats
The /api/stats endpoint performs aggregations to provide:

Summary: Total records and unique source/destination IP counts.
Protocols: Top 10 protocols by volume.
Destinations: Top 10 destination IPs.
Hourly Traffic: A distribution of logs by the hour of the day.
5. API Reference
Authentication
POST /api/auth/login: Validates credentials and returns a JWT.
POST /api/auth/logout: Ends the session.
Data & Analytics
GET /api/columns: Returns a list of available columns in the log view.
POST /api/query: Fetches paginated log records based on applied filters.
POST /api/stats: Returns aggregated analytics for the dashboard.
POST /api/export: Streams filtered results as a CSV file.
Administration (Admin Only)
GET/POST /api/admin/connections: Manage database connections.
GET/POST /api/admin/users: Manage user accounts and assignments.
GET/POST /api/admin/settings: Manage global system settings.
6. Setup and Installation
Prerequisites
Node.js (LTS)
ClickHouse Server running with the view_parsed_logs view configured.
Configuration
Clone the repository.
Install dependencies: npm install.
Configure environment variables in .env (if applicable) or update the default admin credentials.
Start the server: node server.js.
Access the UI at http://localhost:3001.
7. Troubleshooting
Illegal argument of type Date for function toHour: Occurs when log_date (Date) is passed instead of log_datetime (DateTime). Fixed by explicit column resolution in the stats API.
Filter Not Applying: Ensure the logical name matches the COLUMN_MAP or use the Custom Column Filter for non-mapped columns.
Debug Mode: Enable "Debug SQL Preview" in the Admin 
→
 Settings tab to see the exact SQL being sent to ClickHouse.
