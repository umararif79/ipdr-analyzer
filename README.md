# 📊 IPDR Log Analyzer

A high-performance, enterprise-grade web-based analyzer for large-scale network logs stored in ClickHouse.

## 🚀 Version 1.10 - Enterprise IPDR
The current release focuses on the refinement of the **BRAS Management UI**, bringing it in line with the enterprise glassmorphism design system for a polished, professional user experience.

### 🌟 Key Features
- **Dynamic Querying**: Flexible filter system that adapts to database schema in real-time.
- **Multi-Tenancy**: Secure role-based access control (RBAC) with granular connection-to-user mapping.
- **Traffic Insights**: Real-time protocol distribution and destination analytics.
- **Warrant System**: Definable monitoring rules with automated alerting via Telegram and Slack.
- **Health Monitoring**: Integrated connectivity checks for all assigned ClickHouse clusters.
- **Enhanced Governance**: Complete audit trails for all administrative actions.
- **User Personalization**: Custom dashboard preferences and favorite filter sets.

## 🛠 Quick Start

### Installation
```bash
# Clone the repository
git clone https://github.com/umararif79/ipdr-analyzer.git
cd ipdr-analyzer

# Install dependencies
npm install
```

### Configuration
1. Set up your `.env` file with necessary secrets (JWT_SECRET, etc.).
2. Ensure your ClickHouse server has the `view_parsed_logs` view configured.

### Launch
```bash
node server.js
```
Access the UI at: `http://localhost:3001`

---
📄 For detailed technical specifications, see [PROJECT_DOCS.md](./docs/PROJECT_DOCS.md).
