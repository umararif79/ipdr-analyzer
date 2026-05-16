# Project Architecture & Workflow

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
| `src/admin.js` | **The Manager** | Logic for the Admin Panel: managing ClickHouse connections and users. |
| `src/settings.js` | **The Memory** | Saves user preferences (theme, visible columns) to `localStorage`. |

### ⚙️ Backend (The Engine)
The backend acts as a secure proxy and translator between the UI and the Database.

| File | Role | Key Functions |
| :--- | :--- | :--- |
| `server.js` | **The Brain** | Translates UI filters into SQL, manages ClickHouse clients, and aggregates statistics. |
| `localdb.js` | **The Config Store** | An SQLite DB storing users, passwords, and connection mappings. |
| `auth.js` | **The Security Guard** | Validates JWT tokens and enforces Role-Based Access Control (RBAC). |

---

## 2. The Request Lifecycle (Data Flow)

When a user performs an action (e.g., searching for an IP address), the following chain occurs:

### Step 1: Input Capture (Frontend)
`src/filters.js` reads the values from the input boxes. `src/main.js` bundles these values and passes them to `src/api.js`.

### Step 2: API Request (Frontend $\rightarrow$ Backend)
`src/api.js` sends a `POST` request to the server (e.g., `/api/query`). It includes a **JWT Token** in the Authorization header.

### Step 3: Security & Authorization (Backend)
`auth.js` intercepts the request. It verifies the token and checks `localdb.js` to see which ClickHouse connections the user is allowed to access.

### Step 4: SQL Translation (Backend)
`server.js` takes the logical filter (e.g., `dst_ip: '1.1.1.1'`) and converts it into a physical SQL query:
`SELECT * FROM view_parsed_logs WHERE dest_ip = '1.1.1.1' ORDER BY log_datetime DESC LIMIT 50`

### Step 5: Data Retrieval (Backend $\rightarrow$ ClickHouse)
The server retrieves the ClickHouse password from `localdb.js`, opens a connection, executes the query, and receives the result set.

### Step 6: Presentation (Backend $\rightarrow$ Frontend)
The server sends the data back as JSON. `src/main.js` receives it and tells `src/table.js` to render the rows and `src/dashboard.js` to update the charts.

---

## 3. Security Summary
- **Password Safety**: ClickHouse passwords stay on the server. They are never sent to the browser.
- **Access Control**: Users can only query the connections assigned to them in the `user_connections` table.
- **Query Safety**: The server uses an `escapeString` function to prevent SQL injection attacks.
