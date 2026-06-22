# API Usage Samples

This document provides examples of how to interact with the IPDR API using `curl`.

## Configuration
- **Base URL:** `http://localhost:3001`
- **Auth Token:** Replace `YOUR_TOKEN` with your actual JWT.
- **Example Token:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTMsInVzZXJuYW1lIjoiYWRtaW4iLCJyb2xlIjoiYWRtaW4iLCJpYXQiOjE3ODE5NDc5MDMsImV4cCI6MTc4MjAzNDMwM30.dT3GIh867X5L6vPwS0gsm_Kh5jaBdl9RHdvnXlmN9VU`

---

## 🔐 Authentication

### Login
```bash
curl -X POST "http://localhost:3001/api/auth/login" \
     -H "Content-Type: application/json" \
     -d '{"username": "admin", "password": "password123"}'
```

### Logout
```bash
curl -X POST "http://localhost:3001/api/auth/logout" \
     -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 🛠️ Admin Management

### Connections
**List Connections**
```bash
curl -X GET "http://localhost:3001/api/admin/connections" \
     -H "Authorization: Bearer YOUR_TOKEN"
```

**Create Connection**
```bash
curl -X POST "http://localhost:3001/api/admin/connections" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"label": "Site-A", "host": "10.0.0.1", "username": "user", "password": "pass", "database": "syslogdb"}'
```

**Update Connection**
```bash
curl -X PUT "http://localhost:3001/api/admin/connections/1" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"label": "Site-A-Updated", "host": "10.0.0.1", "username": "user", "database": "syslogdb"}'
```

**Delete Connection**
```bash
curl -X DELETE "http://localhost:3001/api/admin/connections/1" \
     -H "Authorization: Bearer YOUR_TOKEN"
```

### Users
**List Users**
```bash
curl -X GET "http://localhost:3001/api/admin/users" \
     -H "Authorization: Bearer YOUR_TOKEN"
```

**Create User**
```bash
curl -X POST "http://localhost:3001/api/admin/users" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"username": "operator", "password": "pass123", "role": "manager", "connectionIds": [1, 2]}'
```

**Update User**
```bash
curl -X PUT "http://localhost:3001/api/admin/users/2" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"username": "operator-updated", "role": "admin", "connectionIds": [1, 2, 3]}'
```

**Delete User**
```bash
curl -X DELETE "http://localhost:3001/api/admin/users/2" \
     -H "Authorization: Bearer YOUR_TOKEN"
```

### System Settings
**Get Settings**
```bash
curl -X GET "http://localhost:3001/api/admin/settings" \
     -H "Authorization: Bearer YOUR_TOKEN"
```

**Update Setting**
```bash
curl -X POST "http://localhost:3001/api/admin/settings" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"key": "debug_mode", "value": "true"}'
```

### Notifications
**Get Notification Config**
```bash
curl -X GET "http://localhost:3001/api/admin/notifications" \
     -H "Authorization: Bearer YOUR_TOKEN"
```

**Update Notification Config**
```bash
curl -X POST "http://localhost:3001/api/admin/notifications" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"provider": "telegram", "token": "bot_token", "chatId": "123456"}'
```

---

## 🌐 Infrastructure (Proxmox Proxy)

### Nodes & VMs
**List Nodes**
```bash
curl -X GET "http://localhost:3001/api/infra/nodes" \
     -H "Authorization: Bearer YOUR_TOKEN"
```

**List VMs**
```bash
curl -X GET "http://localhost:3001/api/infra/vms" \
     -H "Authorization: Bearer YOUR_TOKEN"
```

### BRAS Management
**List BRAS**
```bash
curl -X GET "http://localhost:3001/api/infra/bras-list" \
     -H "Authorization: Bearer YOUR_TOKEN"
```

**Add BRAS**
```bash
curl -X POST "http://localhost:3001/api/infra/bras" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"cidr": "1.2.3.4/32", "deviceName": "BRAS-01", "deviceLabel": "Main-Office"}'
```

**Update BRAS**
```bash
curl -X PUT "http://localhost:3001/api/infra/bras/1.2.3.4%2F32" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"deviceName": "BRAS-01-NEW", "deviceLabel": "Updated-Label"}'
```

**Delete BRAS**
```bash
curl -X DELETE "http://localhost:3001/api/infra/bras/1.2.3.4%2F32" \
     -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 🚨 Monitoring

### Warrants
**List Warrants**
```bash
curl -X GET "http://localhost:3001/api/admin/warrants" \
     -H "Authorization: Bearer YOUR_TOKEN"
```

**Create Warrant**
```bash
curl -X POST "http://localhost:3001/api/admin/warrants" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"name": "High Traffic", "conditions": [{"column": "cnt", "operator": ">", "value": 1000}]}'
```

**Update Warrant**
```bash
curl -X PUT "http://localhost:3001/api/admin/warrants/1" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"name": "Updated Warrant", "active": 0}'
```

**Delete Warrant**
```bash
curl -X DELETE "http://localhost:3001/api/admin/warrants/1" \
     -H "Authorization: Bearer YOUR_TOKEN"
```

### Alerts
**List Active Alerts**
```bash
curl -X GET "http://localhost:3001/api/alerts" \
     -H "Authorization: Bearer YOUR_TOKEN"
```

**Resolve Alert**
```bash
curl -X PUT "http://localhost:3001/api/alerts/1" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"resolved": true}'
```

**Resolve All Alerts**
```bash
curl -X PUT "http://localhost:3001/api/alerts/resolve-all" \
     -H "Authorization: Bearer YOUR_TOKEN"
```

**Clear Alert History**
```bash
curl -X DELETE "http://localhost:3001/api/alerts/clear" \
     -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 👤 User Personalization

### Favorite Filters
**List Favorites**
```bash
curl -X GET "http://localhost:3001/api/filters/favorites" \
     -H "Authorization: Bearer YOUR_TOKEN"
```

**Save Favorite Filter**
```bash
curl -X POST "http://localhost:3001/api/filters/favorites" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"name": "My View", "filter_values": {"src_ip": "1.1.1.1"}}'
```

**Delete Favorite**
```bash
curl -X DELETE "http://localhost:3001/api/filters/favorites/1" \
     -H "Authorization: Bearer YOUR_TOKEN"
```

### Preferences
**Get Preferences**
```bash
curl -X GET "http://localhost:3001/api/preferences" \
     -H "Authorization: Bearer YOUR_TOKEN"
```

**Update Preferences**
```bash
curl -X POST "http://localhost:3001/api/preferences" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"dashboard_layout": {"widget1": "top", "widget2": "bottom"}}'
```

---

## 📊 Data Analysis & Querying

### Core Querying
**Perform Query**
```bash
curl -X POST "http://localhost:3001/api/query" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
           "filters": {"src_ip": "1.2.3.4"},
           "page": 1,
           "pageSize": 50,
           "sortColumn": "timestamp",
           "sortOrder": "DESC"
         }'
```

**Export to CSV**
```bash
curl -X POST "http://localhost:3001/api/export" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"filters": {"src_ip": "1.2.3.4"}, "maxRows": 10000}' \
     --output export.csv
```

**Fetch Available Columns**
```bash
curl -X GET "http://localhost:3001/api/columns" \
     -H "Authorization: Bearer YOUR_TOKEN"
```

**Get Related Logs**
```bash
curl -X GET "http://localhost:3001/api/related?src_ip=1.2.3.4&timestamp=2026-06-20T10:00:00Z" \
     -H "Authorization: Bearer YOUR_TOKEN"
```

### Statistics
**Global Stats**
```bash
curl -X GET "http://localhost:3001/api/stats/global" \
     -H "Authorization: Bearer YOUR_TOKEN"
```

**BRAS Distribution**
```bash
curl -X GET "http://localhost:3001/api/stats/bras-distribution" \
     -H "Authorization: Bearer YOUR_TOKEN"
```

**Hourly Traffic**
```bash
curl -X GET "http://localhost:3001/api/stats/hourly-traffic" \
     -H "Authorization: Bearer YOUR_TOKEN"
```

**Traffic Trend**
```bash
curl -X GET "http://localhost:3001/api/stats/traffic-trend" \
     -H "Authorization: Bearer YOUR_TOKEN"
```

**Heatmap**
```bash
curl -X GET "http://localhost:3001/api/stats/heatmap" \
     -H "Authorization: Bearer YOUR_TOKEN"
```

**Custom Stats Query**
```bash
curl -X POST "http://localhost:3001/api/stats" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"filters": {"src_ip": "1.2.3.4"}}'
```

---

## 🔍 Debugging & Health

**Public Health Check**
```bash
curl -X GET "http://localhost:3001/health"
```

**Authenticated Health Check**
```bash
curl -X GET "http://localhost:3001/api/health" \
     -H "Authorization: Bearer YOUR_TOKEN"
```

**Debug Secret**
```bash
curl -X GET "http://localhost:3001/api/debug/secret"
```
