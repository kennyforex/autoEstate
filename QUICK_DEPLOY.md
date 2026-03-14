# Quick Deployment Guide

This is a simplified, step-by-step guide to deploy FFCS to your VPS.

## Prerequisites
- Ubuntu VPS (2GB RAM minimum)
- Domain name (e.g., yourdomain.com)
- Domain DNS pointed to your VPS IP

## Step 1: Connect to VPS
```bash
ssh root@YOUR_VPS_IP
```

## Step 2: Run Initial Setup (One-time)
Copy and paste this entire block:
```bash
# Update system
apt update && apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install MongoDB
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-7.0.list
apt update && apt install -y mongodb-org
systemctl start mongod && systemctl enable mongod

# Install PM2 and Nginx
npm install -g pm2
apt install -y nginx

# Setup firewall
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# Create app directory
mkdir -p /var/www/ffcs/logs
```

## Step 3: Upload Your Code
On your **local machine**:
```bash
cd /Users/kenny/app/FFCS

# Create archive (excludes unnecessary files)
tar --exclude='node_modules' \
    --exclude='.git' \
    --exclude='backend/uploads' \
    --exclude='backend/dist' \
    --exclude='frontend/dist' \
    -czf ffcs.tar.gz .

# Upload to VPS (replace YOUR_VPS_IP)
scp ffcs.tar.gz root@YOUR_VPS_IP:/var/www/ffcs/
```

Back on **VPS**:
```bash
cd /var/www/ffcs
tar -xzf ffcs.tar.gz
rm ffcs.tar.gz
```

## Step 4: Configure Environment

### Backend Config
```bash
cd /var/www/ffcs/backend
nano .env
```

Paste and update with your values:
```env
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb://localhost:27017/ffcs
JWT_SECRET=CHANGE-THIS-TO-RANDOM-STRING
FRONTEND_URL=https://yourdomain.com

# Your API keys
EVOLUTION_API_URL=your-url
EVOLUTION_API_KEY=your-key
OPENROUTER_API_KEY=your-key
PINECONE_API_KEY=your-key
PINECONE_INDEX=your-index

# Optional email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=noreply@yourdomain.com
APP_URL=https://yourdomain.com
```

Save: `Ctrl+X`, then `Y`, then `Enter`

### Frontend Config
```bash
cd /var/www/ffcs/frontend
nano .env.production
```

Paste and update:
```env
VITE_API_URL=https://api.yourdomain.com
VITE_SOCKET_URL=https://api.yourdomain.com
```

Save: `Ctrl+X`, then `Y`, then `Enter`

## Step 5: Build Application
```bash
# Build backend
cd /var/www/ffcs/backend
npm install --production
npm run build

# Build frontend
cd /var/www/ffcs/frontend
npm install
npm run build
```

## Step 6: Configure Nginx
```bash
nano /etc/nginx/sites-available/ffcs
```

Paste this (replace `yourdomain.com` with your actual domain):
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    root /var/www/ffcs/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}

server {
    listen 80;
    server_name api.yourdomain.com;
    client_max_body_size 100M;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /uploads/ {
        alias /var/www/ffcs/backend/uploads/;
    }
}
```

Save and enable:
```bash
ln -s /etc/nginx/sites-available/ffcs /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default  # Remove default site
nginx -t  # Test config
systemctl reload nginx
```

## Step 7: Start Application
```bash
cd /var/www/ffcs
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Run the command it outputs
```

## Step 8: Setup SSL (HTTPS)
```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d yourdomain.com -d www.yourdomain.com -d api.yourdomain.com
```

Follow prompts, enter your email, agree to terms.

## Step 9: Verify
Visit:
- https://yourdomain.com (Frontend)
- https://api.yourdomain.com/api/health (Backend)

Check status:
```bash
pm2 status
pm2 logs
```

## Future Updates

To update your app, on your **local machine**:
```bash
cd /Users/kenny/app/FFCS
tar --exclude='node_modules' --exclude='.git' --exclude='backend/uploads' --exclude='backend/dist' --exclude='frontend/dist' -czf ffcs-update.tar.gz .
scp ffcs-update.tar.gz root@YOUR_VPS_IP:/var/www/
```

On **VPS**:
```bash
cd /var/www
tar -xzf ffcs-update.tar.gz -C ffcs
cd ffcs
chmod +x deploy.sh
./deploy.sh
```

## Troubleshooting

### Can't access website
```bash
# Check Nginx
systemctl status nginx
nginx -t

# Check firewall
ufw status

# Check DNS
nslookup yourdomain.com
```

### Backend not working
```bash
# Check PM2
pm2 status
pm2 logs ffcs-backend

# Check MongoDB
systemctl status mongod
```

### View logs
```bash
pm2 logs
tail -f /var/log/nginx/error.log
```

### Restart everything
```bash
pm2 restart all
systemctl restart nginx
systemctl restart mongod
```

## Support
For detailed instructions, see `DEPLOYMENT.md`
