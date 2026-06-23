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
git checkout release/v2.1
git pull origin release/v2.1
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
- **Audit Logs**: Verify that navigating to "Audit Logs" in the header loads the system trails and correctly displays JSON values.

## 🛠 Troubleshooting
If you encounter issues after upgrading:
1. **Rollback**: If the server fails to start, you can return to the previous state:
   ```bash
   git checkout release/v1.10
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

This error happened because you have the files on your server, but you haven't initialized the Git repository there. To use git pull, the folder must be a "clone" of your repository, not just a folder where files were uploaded.

Since you already have files there, the safest way to set this up without losing your database (local_system.db) and your secrets (.env) is to follow these steps.

Step 1: Backup your configuration (CRITICAL)

Before doing anything, copy your environment and database files to a safe place, because Git will not track them (and they will be overwritten or deleted if you re-clone).

cp .env ~/ipdr_env_backup
cp local_system.db ~/ipdr_db_backup

Step 2: Convert your folder to a Git Repo

If you already have a repository on GitHub/GitLab, do this:

1. Initialize Git:
git init
2. Link to your remote repository (Replace URL_TO_YOUR_REPO with your actual GitHub/GitLab link):
git remote add origin URL_TO_YOUR_REPO                                                     3. Fetch and Reset:
Since you have files there already, you need to force the local folder to match the remote repository exactly.
git fetch origin
git reset --hard origin/main
3. (Note: If your main branch is called master instead of main, use origin/master)

Step 3: Restore your configuration

Now that the code is clean and updated from Git, put your backup files back:

cp ~/ipdr_env_backup .env
cp ~/ipdr_db_backup local_system.db

Step 4: Finalize the Deployment

Now you can run the build and res is now "clean" and avoids allthose backtick/syntax errors.

npm install
npm run build
pm2 restart all

---
## 🚀 Routine Update Process

Whenever you make changes in the development environment, run these steps on the production server to deploy them safely:

```bash
# 1. Pull latest code from repository
git pull origin main

# 2. Install new dependencies (if any)
npm install

# 3. Rebuild the frontend assets (CRITICAL)
# This ensures the index.html and the hashed asset files in /dist are synchronized.
npm run build

# 4. Restart the backend API
pm2 restart all

# 5. Refresh Nginx (only if config changes were made)
sudo systemctl restart nginx
```

### 💡 Pro-Tip: Automated Deployment Script
To make this even faster, create a script called `deploy.sh` in your project folder:
```bash
#!/bin/bash
git pull origin main
npm install
npm run build
pm2 restart all
sudo systemctl restart nginx
echo "Deployment Successful!"
```
Run it with: `chmod +x deploy.sh && ./deploy.sh`

