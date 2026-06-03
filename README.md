# IPDR Log Analyzer

A high-performance, web-based analyzer for large-scale network logs stored in ClickHouse.

## Version 1.7 - Enterprise Upgrades
The current release introduces a significant architectural shift to a **Service-Oriented Backend**, improving modularity, security, and scalability.

### Key Enhancements in v1.7:
- **Modular Architecture**: Logic moved from `server.js` to dedicated services (`connectionService`, `queryService`, `auditService`, etc.).
- **User Personalization**: Added support for favorite filters and custom dashboard preferences.
- **Health Monitoring**: Integrated connectivity checks for all ClickHouse clusters.
- **Enhanced Governance**: Complete audit trails for all administrative actions.
- **Real-time Alerting**: Integrated notification providers for Telegram and Slack.

## Features
- **Dynamic Querying**: Flexible filter system that adapts to database schema.
- **Multi-Tenancy**: Role-based access control with connection-to-user mapping.
- **Traffic Insights**: Real-time protocol and destination analytics.
- **Warrant System**: Definable monitoring rules with automated alerting.

## Quick Start
1. **Install**: `npm install`
2. **Configure**: Set up your `.env` file and ClickHouse view `view_parsed_logs`.
3. **Launch**: `node server.js`
4. **Access**: Open `http://localhost:3001` in your browser.

See [PROJECT_DOCS.md](docs/PROJECT_DOCS.md) for detailed technical specifications.
