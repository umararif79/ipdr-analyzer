# Installation & Deployment Guide

This guide provides step-by-step instructions for deploying the IPDR Log Analyzer on a CentOS VM hosted on Proxmox.

## 1. Infrastructure Setup (Proxmox)
- **VM Creation**: Create a new Virtual Machine in Proxmox.
- **OS**: CentOS Stream 9 (Recommended).
- **Resources**: 
  - CPU: 2 vCPUs
  - RAM: 4GB
  - Disk: 20GB+
- **Network**: Assign a static IP address to the VM.

---

## 2. Server Environment Setup
Execute the following commands on the CentOS VM to prepare the environment.

### System Update & Node.js Installation
```bash
# Update system packages
sudo dnf update -y

# Install NVM (Node Version Manager) to manage Node.js versions
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash
source ~/.bashrc

# Install Node.js LTS (Version 20)
nvm install 20
nvm use 20
```

### Install Process Manager & Web Server
```bash
# Install PM2 to ensure the app runs in the background and restarts on crash
npm install -g pm2

# Install Nginx as a Reverse Proxy
sudo dnf install nginx -y
sudo systemctl enable --now nginx
```

---

## 3. Application Deployment

### Upload & Install
1. Upload the project folder to the server (e.g., `/var/www/ipdr-analyzer`). except `node_modules` folder, npm install will install related modules itself according to OS
2. Navigate to the directory: `cd /var/www/ipdr-analyzer`.
3. Install dependencies:
   ```bash
   npm install
   ```

### Launching the Application
Use PM2 to start the server in production mode:
```bash
# Start the server
pm2 start server.js --name "ipdr-api"

# Ensure PM2 starts on boot
pm2 save
pm2 startup
```

---

## 4. Reverse Proxy Configuration (Nginx)

To securely expose the app on port 80 and hide the Node.js port (3001), configure Nginx.

1. Create or edit the configuration file: `/etc/nginx/conf.d/ipdr.conf`
2. Add the following configuration:
```nginx
server {
    listen 80;
    server_name your_vm_ip_or_domain;

    location / {
        proxy_pass http://localhost:3001; # Forward traffic to Node.js
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```
3. Restart Nginx:
   ```bash
   sudo systemctl restart nginx
   ```

---

## 5. Firewall & Security Hardening

Lock down the VM so that only necessary ports are open to the network.

### Configure Firewalld
```bash
# Allow standard web traffic and SSH
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --add-service=ssh

# Explicitly block the Node.js port from external access
sudo firewall-cmd --permanent --remove-port=3001/tcp

# Apply changes
sudo firewall-cmd --reload
```

### Security Summary
- **Port 80/443**: Open (Handled by Nginx).
- **Port 3001**: Closed to external traffic (Accessible only internally via Nginx).
- **Port 22**: Open (SSH for administration).
- **Authentication**: All API requests are protected by JWT tokens.

