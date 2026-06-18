# Production Upgrade Guide

This guide provides step-by-step instructions for upgrading your production instance of the IPDR Log Analyzer to the latest version.

## 📋 Pre-Upgrade Checklist
Before proceeding with the upgrade, ensure you have performed the following:
- [ ] **Backup Local Database**: Copy `local_system.db` to a secure backup location.
- [ ] **Backup Environment**: Copy your `.env` file.
- [ ] **Verify Access**: Ensure you have SSH access and appropriate permissions on the production server.

---

## 🚀 Upgrade Procedure

### 1. Update Source Code
Connect to your server and pull the latest stable release branch.

```bash
# Navigate to the project directory
cd /path/to/your/ipdr-analyzer

# Ensure you are on the latest release branch
git checkout release/v1.8
git pull origin release/v1.8
```

### 2. Update Dependencies
Install any new or updated dependencies required for this version.

```bash
npm install
```

### 3. Restart the Application
Depending on your deployment method, use one of the following:

#### If using PM2 (Process Manager)
```bash
pm2 restart all
# OR
pm2 restart ipdr-server
```

#### If running manually
Stop the current process (`Ctrl+C`) and restart:
```bash
node server.js
```

---

## ✅ Post-Upgrade Verification

After the server restarts, verify the following to ensure a successful upgrade:

### 1. Server Health
Check the server logs for the boot message:
- Expected: `[SERVER BOOT] Starting server ...`

### 2. Feature Validation
- **Trend Graphs**: Verify that the **Traffic Heatmap (30 Days)** and **BRAS Daily Distribution (7 Days)** correctly display historical data regardless of the current date filter.
- **Custom Filters**: Create a custom rule (e.g., `src_port = 80`) and ensure the query executes without `Substitution` errors.
- **Admin Panel**: Verify that connectivity checks for all ClickHouse clusters are functioning.

## 🛠 Troubleshooting
If you encounter issues after upgrading:
1. **Rollback**: If the server fails to start, you can return to the previous state:
   ```bash
   git checkout release/v1.7
   npm install
   pm2 restart all
   ```
2. **Logs**: Check the server logs for specific error messages to diagnose the issue.


Quick Summary for Transfer

If you are using a zip file for transfer (as discussed earlier), your package should look like this:
/ipdr-analyzer/
├── .env
├── package.json
├── package-lock.json
├── server.js
├── localdb.js
├── auth.js
├── crypto.js
├── logger.js
├── index.html
├── login.html
├── api-docs.html
├── src/ (all services inside)
└── docs/ (optional)