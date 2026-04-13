# VPS Deployment Guide

This guide will help you deploy the Foodflow application to a VPS (Virtual Private Server).

## Prerequisites

- A VPS with Ubuntu 22.04 or later (recommended: 2GB+ RAM, 2+ CPU cores)
- Domain name pointed to your VPS IP address
- SSH access to your VPS
- sudo privileges on the VPS

## 1. Initial Server Setup

SSH into your VPS:
```bash
ssh root@your-vps-ip
```

### Update System
```bash
apt update && apt upgrade -y
```

### Install Node.js 20.x
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
apt install -y nodejs
node -v  # Should show v20.x
npm -v
```

### Install MongoDB
```bash
# Import MongoDB GPG key
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
   sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor

# Add MongoDB repository
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | \
   sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

# Install MongoDB
apt update
apt install -y mongodb-org

# Start MongoDB
systemctl start mongod
systemctl enable mongod
systemctl status mongod
```

### Install PM2 (Process Manager)
```bash
npm install -g pm2
```

### Install Nginx (Web Server)
```bash
apt install -y nginx
systemctl start nginx
systemctl enable nginx
```

### Setup Firewall
```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
```

## 2. Application Setup

### Create Application Directory
```bash
mkdir -p /var/www/ffcs
cd /var/www/ffcs
```

### Clone Your Repository (Option A)
If using Git:
```bash
git clone <your-repo-url> .
```

### Or Upload Files Manually (Option B)
From your local machine:
```bash
# Compress your project
cd /path/to/foodflow
tar -czf ffcs.tar.gz --exclude=node_modules --exclude=.git --exclude=backend/uploads --exclude=frontend/dist --exclude=backend/dist .

# Upload to VPS
scp ffcs.tar.gz root@your-vps-ip:/var/www/ffcs/

# On VPS, extract
cd /var/www/ffcs
tar -xzf ffcs.tar.gz
rm ffcs.tar.gz
```

## 3. Configure Environment Variables

### Backend Environment
```bash
cd /var/www/ffcs/backend
cp .env.example .env
nano .env
```

Update with your production values:
```env
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb://localhost:27017/ffcs
JWT_SECRET=your-super-secret-jwt-key-change-this
FRONTEND_URL=https://yourdomain.com

# Evolution API (WhatsApp)
EVOLUTION_API_URL=your-evolution-api-url
EVOLUTION_API_KEY=your-evolution-api-key

# OpenRouter AI
OPENROUTER_API_KEY=your-openrouter-key

# Pinecone
PINECONE_API_KEY=your-pinecone-key
PINECONE_INDEX=your-index-name

# Email (Optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=noreply@yourdomain.com
APP_URL=https://yourdomain.com
```

### Frontend Environment
```bash
cd /var/www/ffcs/frontend
nano .env.production
```

Add:
```env
VITE_API_URL=https://api.yourdomain.com
VITE_SOCKET_URL=https://api.yourdomain.com
```

## 4. Install Dependencies and Build

### Backend
```bash
cd /var/www/ffcs/backend
npm install --production
npm run build
```

### Frontend
```bash
cd /var/www/ffcs/frontend
npm install
npm run build
```

## 5. Setup PM2

Create PM2 ecosystem file:
```bash
cd /var/www/ffcs
nano ecosystem.config.js
```

Add the following content (see ecosystem.config.js file in the repo).

Start the application:
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Follow the instructions it provides
```

## 6. Configure Nginx

Create Nginx configuration:
```bash
nano /etc/nginx/sites-available/ffcs
```

Add the configuration (see nginx.conf file in the repo).

Enable the site:
```bash
ln -s /etc/nginx/sites-available/ffcs /etc/nginx/sites-enabled/
nginx -t  # Test configuration
systemctl reload nginx
```

## 7. Setup SSL with Let's Encrypt

Install Certbot:
```bash
apt install -y certbot python3-certbot-nginx
```

Get SSL certificate:
```bash
certbot --nginx -d yourdomain.com -d api.yourdomain.com
```

Follow the prompts. Certbot will automatically configure Nginx for HTTPS.

## 8. Verify Deployment

Check PM2 status:
```bash
pm2 status
pm2 logs  # View logs
```

Test the application:
- Frontend: https://yourdomain.com
- Backend API: https://api.yourdomain.com/api/health

## 9. Updating the Application

### Option A: Using Git
```bash
cd /var/www/ffcs
git pull origin main

# Rebuild backend
cd backend
npm install --production
npm run build

# Rebuild frontend
cd ../frontend
npm install
npm run build

# Restart PM2
pm2 restart all
```

### Option B: Manual Upload
```bash
# On local machine
cd /path/to/foodflow
tar -czf ffcs-update.tar.gz --exclude=node_modules --exclude=.git --exclude=backend/uploads --exclude=frontend/dist --exclude=backend/dist .
scp ffcs-update.tar.gz root@your-vps-ip:/var/www/

# On VPS
cd /var/www
tar -xzf ffcs-update.tar.gz -C ffcs --strip-components=0
cd ffcs

# Rebuild and restart (same as Git option above)
```

### Quick Update Script
Create a deployment script:
```bash
nano /var/www/ffcs/deploy.sh
```

See deploy.sh file for the script content.

Make it executable:
```bash
chmod +x /var/www/ffcs/deploy.sh
```

To update in the future:
```bash
cd /var/www/ffcs
./deploy.sh
```

## 10. Maintenance Commands

### View Logs
```bash
pm2 logs ffcs-backend
pm2 logs ffcs-backend --lines 100
tail -f /var/log/nginx/error.log
```

### Restart Services
```bash
pm2 restart all
systemctl restart nginx
systemctl restart mongod
```

### Monitor Resources
```bash
pm2 monit
htop
```

### Backup Database
```bash
mongodump --db=ffcs --out=/backups/$(date +%Y%m%d)
```

### Check Disk Space
```bash
df -h
du -sh /var/www/ffcs/*
```

## Security Recommendations

1. **Change default MongoDB port** or bind to localhost only
2. **Setup MongoDB authentication**:
   ```bash
   mongosh
   use admin
   db.createUser({
     user: "ffcs_admin",
     pwd: "strong_password",
     roles: ["readWriteAnyDatabase"]
   })
   ```
3. **Regular updates**: `apt update && apt upgrade`
4. **Setup fail2ban** to prevent brute force attacks
5. **Regular backups** of database and uploads folder
6. **Monitor logs** regularly for suspicious activity

## Troubleshooting

### Backend not starting
```bash
pm2 logs ffcs-backend
# Check for errors in environment variables or MongoDB connection
```

### Nginx 502 Bad Gateway
```bash
# Check if backend is running
pm2 status
# Check backend logs
pm2 logs ffcs-backend
# Check Nginx logs
tail -f /var/log/nginx/error.log
```

### Cannot connect to MongoDB
```bash
# Check MongoDB status
systemctl status mongod
# Check MongoDB logs
tail -f /var/log/mongodb/mongod.log
```

### SSL certificate issues
```bash
certbot renew --dry-run
certbot certificates
```

## Support

For issues or questions, check the logs first:
- PM2 logs: `pm2 logs`
- Nginx logs: `/var/log/nginx/`
- MongoDB logs: `/var/log/mongodb/`
