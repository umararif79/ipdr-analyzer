# Project Architecture & Workflow (v1.7)

This document explains the role of each file and how data flows through the system.

## 1. File Responsibilities

### 🌐 Frontend (The User Interface)
The frontend is a "thin client." It does not process data; it only displays it and captures user input.

| File | Role | Key Functions |
| :--- | :--- | :--- |
| `index.html` | **The Skeleton** | Defines the layout, filter grid, and dashboard containers. |
| `src/main.js` | **The Orchestrator** | Coordinates the entire app. Triggering data loads, handling pagination and sorting. |
| `src/api.js` | **The Communicator** | The only file that talks to the server via `fetch()`. Handles JWT headers. |
| `src/filters.js` | **The Input Manager** | Manages the filter panel, maps columns, and handles period selectors (Today/Yesterday). |
| `src/table.js` | **The Data Grid** | Renders the raw JSON results from the server into a readable HTML table. |
| `src/dashboard.js` | **The Visualizer** | Processes statistical data to update counters and traffic charts. |
| `src/admin.js` | **The Manager** | Logic for the Admin Panel: managing ClickHouse connections, users, and warrants. |
| `src/settings.js` | **The Memory** | Saves user preferences (theme, visible columns) to `localStorage`. |

### ⚙️ Backend (The Engine)
The backend acts as a secure proxy and translator between the UI and the Database, now utilizing a modular service architecture.

| File | Role | Key Functions |
| :--- | :--- | :--- |
| `server.js` | **The API Gateway** | Handles HTTP routing, middleware integration, and delegates business logic to services. |
| `src/services/connectionService.js` | **DB Manager** | Manages ClickHouse clients and column caching. |
| `src/services/queryService.js` | **Query Builder** | Translates filters into SQL and performs statistical aggregations. |
| `src/services/auditService.js` | **Compliance** | Logs administrative changes to the audit trail. |
| `src/services/monitoringService.js` | **Watchdog** | Runs background anomaly detection and warrant checks. |
| `src/services/notificationService.js` | **Messenger** | Dispatches alerts to Telegram/Slack. |
| `src/services/validationService.js` | **Gatekeeper** | Validates API request bodies against defined schemas. |
| `localdb.js` | **The Config Store** | An SQLite DB storing users, passwords, connection mappings, and warrants. |
| `auth.js` | **The Security Guard** | Validates JWT tokens and enforces Role-Based Access Control (RBAC). |

---

## 2. The Request Lifecycle (Data Flow)

When a user performs an action (e.g., searching for an IP address), the following chain occurs:

### Step 1: Input Capture (Frontend)
`src/filters.js` reads the values from the input boxes. `src/main.js` bundles these values and passes them to `src/api.js`.

### Step 2: API Request (Frontend $\rightarrow$ Backend)
`src/api.js` sends a `POST` request to the server (e.g., `/api/query`). It includes a **JWT Token** in the Authorization header.

### Step 3: Security & Validation (Backend)
1. `auth.js` verifies the token and checks `localdb.js` for authorized connections.
2. `validationService.js` checks the request body against the required schema.

### Step 4: Logic Execution (Service Layer)
The request is routed to the appropriate service:
- For queries: `queryService.js` builds the SQL $\rightarrow$ `connectionService.js` provides the DB client $\rightarrow$ ClickHouse executes.
- For admin tasks: `auditService.js` logs the change $\rightarrow$ `localdb.js` updates the configuration.

### Step 5: Data Retrieval (Backend $\rightarrow$ ClickHouse)
The server retrieves the ClickHouse password from `localdb.js` (via `connectionService.js`), opens a connection, executes the query, and receives the result set.

### Step 6: Presentation (Backend $\rightarrow$ Frontend)
The server sends the data back as JSON. `src/main.js` receives it and tells `src/table.js` to render the rows and `src/dashboard.js` to update the charts.

---

## 3. Security Summary
- **Password Safety**: ClickHouse passwords stay on the server. They are never sent to the browser.
- **Access Control**: Users can only query the connections assigned to them in the `user_connections` table.
- **Query Safety**: The server uses a structured query builder in `queryService.js` to prevent SQL injection.
- **Auditability**: All administrative changes are permanently logged in the SQLite audit table.
