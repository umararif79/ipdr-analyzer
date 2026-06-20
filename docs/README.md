IPDR Log Analyzer
A high-performance, web-based analyzer for large-scale network logs stored in ClickHouse.

Version 1.10 - Enterprise IPDR
The current release focuses on the refinement of the BRAS Management UI, bringing it in line with the enterprise glassmorphism design system for a polished, professional user experience.

ustom dashboard preferences.
Health Monitoring: Integrated connectivity checks for all ClickHouse clusters.
Enhanced Governance: Complete audit trails for all administrative actions.
Real-time Alerting: Integrated notification providers for Telegram and Slack.
Features
Dynamic Querying: Flexible filter system that adapts to database schema.
Multi-Tenancy: Role-based access control with connection-to-user mapping.
Traffic Insights: Real-time protocol and destination analytics.
Warrant System: Definable monitoring rules with automated alerting.
Quick Start
Install: npm install
Configure: Set up your .env file and ClickHouse view view_parsed_logs.
Launch: node server.js
Access: Open http://localhost:3001 in your browser.
See PROJECT_DOCS.md for detailed technical specifications.