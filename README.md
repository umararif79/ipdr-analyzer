# 🌐 IPDR Log Analyzer
### Enterprise-Grade ISP Surfing Log Analytics Suite

[![Version](https://img.shields.io/badge/version-v2.3-blue.svg)](#version-history)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-lightgrey.svg)]()

The **IPDR Log Analyzer** is a high-performance, specialized analytics platform designed for Internet Service Providers (ISPs) to analyze, monitor, and audit massive volumes of surfing logs stored in **ClickHouse**. By combining the raw power of ClickHouse with a modern glassmorphism UI, it transforms raw log data into actionable intelligence.

---

## 🚀 Key Features

### 📊 Advanced Analytics Dashboard
- **Compact 2x2 Grid Layout**: Optimized real estate usage for an immediate high-level overview of network traffic.
- **Adaptive Full-Screen Expansion**: One-click expansion of any graph into a high-resolution modal for deep-dive analysis.
- **Visual Export**: Integrated "Export Image" functionality to save chart snapshots as PNGs for reporting.
- **Trend Analysis**: 30-day Traffic Heatmaps and 7-day BRAS distribution charts to identify patterns and anomalies.

### 🛡️ Enterprise Governance & Security
- **Audit Log System**: Complete traceability of all administrative changes, ensuring compliance and accountability.
- **JWT Authentication**: Role-based access control (RBAC) ensuring that only authorized personnel can access sensitive log data.
- **Multi-Tenant Connection Registry**: Dynamic mapping of users to specific ClickHouse clusters via a local SQLite metadata store.

### ⚙️ Technical Sophistication
- **Dynamic Schema Resolution**: Intelligent column aliasing allows the tool to work across varying ClickHouse table schemas without code changes.
- **Parallel Query Execution**: Implementation of `Promise.all` for dashboard stats, significantly reducing page load times.
- **Warrant & Alert System**: Real-time monitoring rules (warrants) that trigger alerts when specific suspicious patterns are detected.
- **Interactive API Playground**: A built-in Swagger-style tester to validate and explore API endpoints in real-time.

---

## 🛠️ Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend** | Vite, Vanilla JS, Chart.js | High-performance UI & Data Visualization |
| **Backend** | Node.js, Express | Secure API Proxy & Orchestration |
| **Log Store** | ClickHouse | OLAP database for billion-row log datasets |
| **Meta Store** | SQLite (`better-sqlite3`) | Local storage for users, roles, and connections |
| **Auth** | JWT (JSON Web Tokens) | Secure, stateless session management |
| **Design** | CSS Glassmorphism | Modern, enterprise-dark themed interface |

---

## 📐 Architecture

`User Browser` $\rightarrow$ `Express Proxy Server` $\rightarrow$ `SQLite (Auth/Config)` $\rightarrow$ `ClickHouse Cluster (Logs)`

The system acts as a secure gateway, validating user roles in SQLite before forwarding optimized SQL queries to the distributed ClickHouse backend.

---

## 📦 Installation & Setup

1. **Clone the Repository**
   ```bash
   git clone https://github.com/umararif79/ipdr-analyzer.git
   cd ipdr-analyzer
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Configuration**
   - Configure your ClickHouse connection strings in the Admin panel.
   - Set up your environment variables in `.env`.

4. **Launch Application**
   ```bash
   npm run dev
   ```

---

## 📅 Version History

### v2.3 (Latest)
- **Dashboard UX**: Introduced compact 2x2 grid and full-page adaptive expansion.
- **Reporting**: Added PNG export for all dashboard charts.

### v2.2
- **Performance**: Parallelized dashboard queries using `Promise.all`.
- **Data Integrity**: Fixed timezone gaps (Asia/Karachi) and implemented robust `toDateTime()` casting.

### v2.1
- **Compliance**: Launched the comprehensive Audit Log system.
- **Security**: Backend API bound to localhost.

### v1.10 - v1.4
- **Foundations**: Modularized API endpoints, implemented JWT auth, created the BRAS management UI, and established the core routing system.

---

## 📄 License
This project is licensed under the MIT License.
