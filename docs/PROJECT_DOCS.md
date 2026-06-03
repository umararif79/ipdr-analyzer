# IPDR Log Analyzer - Project Documentation (v1.7)

## 1. Overview
The IPDR Log Analyzer is a professional web-based tool designed to query, filter, and analyze large-scale network logs stored in ClickHouse. It provides a user-friendly interface to search through parsed logs, visualize traffic patterns via a dashboard, and manage multiple ClickHouse connections with role-based access control.

### Core Objectives
- **High-Performance Querying**: Leverage ClickHouse's speed to query millions of records with efficient pagination and sorting.
- **Dynamic Filtering**: Provide a flexible filtering system that adapts to the columns available in the database view.
- **Multi-Connection Management**: Allow administrators to configure multiple database sources and assign them to specific users.
- **Traffic Insights**: Generate real-time statistics on protocol distribution, top destinations, and hourly traffic.

---

## 2. Architecture
The project follows a Client-Server architecture, recently evolved into a **Service-Oriented Backend** for better scalability and maintainability.

### Tech Stack
- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3.
- **Backend**: Node.js with Express.js.
- **Primary Database (Logs)**: ClickHouse (accessed via `@clickhouse/client`).
- **Local Database (Config/Auth)**: SQLite (via `better-sqlite3`).
- **Authentication**: JSON Web Tokens (JWT) for secure session management.

### Service-Oriented Backend
To decouple logic from the routing layer, the backend now utilizes specialized services:
- **`connectionService.js`**: Manages ClickHouse client instantiation, connection resolution, and column caching.
- **`queryService.js`**: Handles SQL generation (WHERE clauses), date range calculations, and statistical data aggregation.
- **`auditService.js`**: Records administrative actions (CREATE, UPDATE, DELETE) for security auditing.
- **`monitoringService.js`**: Implements background tasks for anomaly detection and warrant monitoring.
- **`notificationService.js`**: Manages external alerts via Telegram and Slack providers.
- **`validationService.js`**: Provides schema-based request validation to ensure API data integrity.

### Data Flow
`User Browser` $\rightarrow$ `Express API` $\rightarrow$ `Validation Service` $\rightarrow$ `Business Service` $\rightarrow$ `SQLite/ClickHouse` $\rightarrow$ `Response` $\rightarrow$ `UI`

---

## 3. Database Design

### Local SQLite Database (`localdb.js`)
Stores application configuration and user accounts.
- **`users`**: Stores user credentials (hashed passwords), roles (admin/user), and profile info.
- **`connections`**: Stores ClickHouse connection details (host, username, password, database).
- **`user_connections`**: A mapping table that assigns specific ClickHouse connections to specific users.
- **`system_settings`**: Key-value store for global application behavior (e.g., `debug_mode`).
- **`favorite_filters`**: Stores user-defined favorite filter sets.
- **`user_preferences`**: Stores UI personalization settings (e.g., dashboard layout).
- **`warrants`**: Defines monitoring rules for automatic log alerts.
- **`alerts`**: Stores detected incidents triggered by warrants (includes `fingerprint` for deduplication).

### ClickHouse Storage
The application interacts with a specific view: `view_parsed_logs`.
- **Expected Columns**: Includes `log_date` (Date), `log_datetime` (DateTime64), `src_ip`, `dest_ip`, `proto`, `src_port`, `dest_port`, and others.
- **Optimization**: The application uses `log_date` for partition pruning to ensure queries remain fast even as data grows.

---

## 4. Key Features & Implementation

### Dynamic Filter System
The system uses a "Logical-to-Physical" column mapping to bridge the gap between user-friendly UI labels and actual database column names.
- **Known Filters**: Hardcoded common fields (IPs, Ports, Protocol) that appear if a match is found in the table schema.
- **Custom Column Filter**: Allows users to select *any* column from the table and apply an exact match filter.
- **Date Bounds**: The UI automatically manages `dateFrom` and `dateTo`, ensuring that queries are always bounded to a specific time range to prevent full-table scans.

### Period Selector
Provides quick-access time ranges:
- **Today**: From midnight today until now.
- **Yesterday**: Full 24-hour window for the previous day.
- **Last Week**: From 7 days ago until now.

### User Personalization
- **Favorite Filters**: Users can save complex filter configurations for one-click access.
- **UI Preferences**: Customizable dashboard layouts and viewing preferences stored per user.

### Admin Panel & Governance
A secure area for administrators to:
- **Manage Connections**: Add, edit, or delete ClickHouse database connections.
- **Manage Users**: Create users and assign them access to specific database connections.
- **System Settings**: Toggle "Debug SQL Preview" and configure global timeouts.
- **Notification Engine**: Configure Telegram/Slack webhooks for real-time system alerts.

### Warrant & Alert System
Allows admins to define "Warrants" (monitoring rules). If a query matches the warrant conditions, an "Alert" is generated and stored, notifying the admin via the configured channel.

### Health Monitoring
Integrated health checks to verify the connectivity and responsiveness of all assigned ClickHouse clusters.

---

## 5. API Reference

### Authentication
- `POST /api/auth/login`: Validates credentials and returns a JWT.
- `POST /api/auth/logout`: Ends the session.

### Data & Analytics
- `GET /api/columns`: Returns a list of available columns in the log view.
- `POST /api/query`: Fetches paginated log records based on applied filters.
- `POST /api/stats`: Returns aggregated analytics for the dashboard.
- `POST /api/export`: Streams filtered results as a CSV file.
- `GET /api/related`: Retrieves logs temporally related to a specific event.
- `GET /api/health`: Checks connectivity of all active ClickHouse connections.

### User Personalization
- `GET /api/filters/favorites`: Get saved filters.
- `POST /api/filters/favorites`: Save a new favorite filter.
- `DELETE /api/filters/favorites/:id`: Remove a favorite filter.
- `GET /api/preferences`: Get user UI settings.
- `POST /api/preferences`: Update user UI settings.

### Administration (Admin Only)
- `GET/POST /api/admin/connections`: Manage database connections.
- `GET/POST /api/admin/users`: Manage user accounts and assignments.
- `GET/POST /api/admin/settings`: Manage global system settings.
- `GET/POST /api/admin/notifications`: Configure alert delivery providers (Slack/Telegram).
- `GET/POST/PUT/DELETE /api/admin/warrants`: Manage monitoring rules.

### Alerts
- `GET /api/alerts`: List unresolved alerts.
- `PUT /api/alerts/:id`: Resolve a specific alert.
- `PUT /api/alerts/resolve-all`: Bulk resolve alerts.
- `DELETE /api/alerts/clear`: Purge alert history.

---

## 6. Setup and Installation

### Prerequisites
- Node.js (LTS)
- ClickHouse Server running with the `view_parsed_logs` view configured.

### Configuration
1. Clone the repository.
2. Install dependencies: `npm install`.
3. Configure environment variables in `.env` (if applicable) or update the default admin credentials.
4. Start the server: `node server.js`.
5. Access the UI at `http://localhost:3001`.

---

## 7. Troubleshooting
- **Illegal argument of type Date for function toHour**: Occurs when `log_date` (Date) is passed instead of `log_datetime` (DateTime). Fixed by explicit column resolution in the stats API.
- **Filter Not Applying**: Ensure the logical name matches the `COLUMN_MAP` or use the Custom Column Filter for non-mapped columns.
- **Debug Mode**: Enable "Debug SQL Preview" in the Admin $\rightarrow$ Settings tab to see the exact SQL being sent to ClickHouse.
