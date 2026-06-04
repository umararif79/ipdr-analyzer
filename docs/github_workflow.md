# GitHub Workflow & Version Control

This document outlines the official version control strategy for the IPDR Log Analyzer project to ensure stability and a clear path from development to production.

## 1. Branching Strategy

The project uses a two-branch system to separate unstable development from stable production.

| Branch | Purpose | Stability | Deployment Target |
| :--- | :--- | :--- | :--- |
| `main` | **Production** | High (Stable) | Production VM |
| `develop` | **Beta/Development** | Medium (Testing) | Beta VM / Localhost |

### The Rule of Development
**Never commit directly to `main`.** All new features, bug fixes, and experiments must be committed to the `develop` branch first. Once a feature is verified and stable, it is merged into `main`.

---

## 2. Daily Development Workflow (Beta)

Use these steps when making changes to the project:

```bash
# 1. Switch to the development branch
git checkout develop

# 2. Make changes to the code...

# 3. Stage and commit changes
git add .
git commit -m "Brief description of what was changed"

# 4. Push changes to GitHub
git push origin develop
```

---

## 3. The Release Process (Moving to Production)

When the `develop` branch is stable and ready for a new version release:

```bash
# 1. Switch to the main branch
git checkout main

# 2. Pull the latest stable version (if any)
git pull origin main

# 3. Merge the tested changes from develop into main
git merge develop

# 4. Push the new stable version to GitHub
git push origin main
```

---

## 4. Version Tagging (Snapshots)

To create a permanent recovery point (e.g., v1.0, v1.1), use Git Tags. This allows you to rollback the entire project to a specific version if a critical bug is found in production.

```bash
# 1. Ensure you are on the main branch
git checkout main

# 2. Create a tagged version
git tag -a v1.1 -m "Release version 1.1: Added Admin settings and fixed filters"

# 3. Push the tag to GitHub
git push origin v1.1
```

---

## 5. Deploying to CentOS Server

Once the code is pushed to GitHub, update the server to match the desired version.

### To update to Production (Stable):
```bash
cd /var/www/ipdr-analyzer
git checkout main
git pull origin main
pm2 restart ipdr-api
```

### To test Beta version on server:
```bash
cd /var/www/ipdr-analyzer
git checkout develop
git pull origin develop
pm2 restart ipdr-api
```

---

## 6. Git Commands Cheat Sheet

| Command | Description |
| :--- | :--- |
| `git branch` | Show current branch. |
| `git checkout <branch>` | Switch to a different branch. |
| `git checkout -b <name>` | Create and switch to a new branch. |
| `git status` | See which files are modified/staged. |
| `git log --oneline` | See a compact history of commits. |
| `git remote -v` | Verify the linked GitHub repository URL. |
| `git push origin <branch>` | Upload local commits to GitHub. |
