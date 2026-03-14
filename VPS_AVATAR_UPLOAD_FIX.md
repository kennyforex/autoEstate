# Fix Avatar Upload on VPS

## Root Cause

The avatar upload fails on VPS because the backend returns a localhost URL instead of the public API URL. When the frontend tries to update the profile with this URL, the validation passes, but the avatar URL isn't accessible from the browser.

## Solution

### Step 1: Update VPS Backend Environment Variables

SSH into your VPS and update the backend `.env` file:

```bash
ssh root@YOUR_VPS_IP
cd /var/www/ffcs/backend
nano .env
```

**Add or update these lines** (replace `api.yourdomain.com` with your actual API domain):

```env
# Backend public URL - MUST be the public API domain
BACKEND_PUBLIC_URL=https://api.yourdomain.com

# CORS - include your frontend domain
CORS_ORIGIN=https://yourdomain.com

# Frontend URL
APP_URL=https://yourdomain.com
```

**Important Notes:**

- Use `https://` (not `http://`) if you have SSL configured (which you should)
- Use your actual domain name (not `yourdomain.com`)
- The `BACKEND_PUBLIC_URL` should match your API subdomain

Save the file: `Ctrl+X`, then `Y`, then `Enter`

### Step 2: Ensure Uploads Directory Exists and Has Correct Permissions

```bash
cd /var/www/ffcs/backend
mkdir -p uploads/logos
chown -R www-data:www-data uploads/
chmod -R 755 uploads/
```

### Step 3: Restart the Backend

```bash
pm2 restart ffcs-backend
pm2 logs ffcs-backend --lines 50
```

Look for the startup logs. You should see:

```
🚀 Server running on port 5000
📡 WebSocket server ready
📁 Uploads served from: /var/www/ffcs/backend/uploads -> /uploads
```

### Step 4: Verify Nginx Configuration

Check that nginx is properly configured to serve uploaded files:

```bash
nginx -t
```

Should show: `syntax is ok` and `test is successful`

If you made changes to nginx.conf, reload it:

```bash
systemctl reload nginx
```

### Step 5: Test the Upload

1. Go to your website: `https://yourdomain.com`
2. Log in and navigate to Settings → Profile
3. Try uploading an avatar
4. Check the browser console for any errors
5. Check backend logs: `pm2 logs ffcs-backend --lines 20`

## Verification

After uploading, the avatar URL should look like:

```
https://api.yourdomain.com/uploads/logos/xxxxx-xxxxx-xxxxx.png
```

**NOT like:**

- `http://localhost:5000/uploads/logos/...` ❌
- `http://localhost:3001/uploads/logos/...` ❌

## Troubleshooting

### Issue 1: Avatar URL still shows localhost

**Check backend logs:**

```bash
pm2 logs ffcs-backend | grep "BACKEND_PUBLIC_URL"
```

**Verify environment variable is set:**

```bash
cd /var/www/ffcs/backend
pm2 restart ffcs-backend
pm2 logs ffcs-backend --lines 50
```

Look for any errors loading the `.env` file.

### Issue 2: 404 when accessing uploaded image

**Check if file was created:**

```bash
ls -la /var/www/ffcs/backend/uploads/logos/
```

You should see `.png`, `.jpg`, `.gif`, or `.webp` files.

**Test direct access:**

```bash
curl -I https://api.yourdomain.com/uploads/logos/FILENAME.png
```

Should return `200 OK`, not `404 Not Found`.

**If 404, check nginx logs:**

```bash
tail -50 /var/log/nginx/error.log
```

### Issue 3: Permission denied errors

**Check ownership:**

```bash
ls -la /var/www/ffcs/backend/
```

The `uploads` directory should be owned by `www-data` or the user running PM2.

**Fix permissions:**

```bash
cd /var/www/ffcs/backend
sudo chown -R $USER:$USER uploads/
chmod -R 755 uploads/
```

### Issue 4: CORS errors in browser

Update backend `.env`:

```env
CORS_ORIGIN=https://yourdomain.com
```

Then restart:

```bash
pm2 restart ffcs-backend
```

### Issue 5: SSL/HTTPS issues

If you're using HTTP instead of HTTPS:

```env
BACKEND_PUBLIC_URL=http://api.yourdomain.com
```

But **strongly recommended**: Set up SSL with Let's Encrypt:

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d yourdomain.com -d api.yourdomain.com
```

## Example VPS .env File

Here's a complete example (replace with your values):

```env
# Server
NODE_ENV=production
PORT=5000

# MongoDB
MONGODB_URI=mongodb://localhost:27017/ffcs

# JWT
JWT_SECRET=your-super-secret-random-string-change-this

# Public URLs - USE YOUR ACTUAL DOMAINS!
BACKEND_PUBLIC_URL=https://api.yourdomain.com
APP_URL=https://yourdomain.com
CORS_ORIGIN=https://yourdomain.com

# Evolution API
EVOLUTION_API_URL=your-evolution-url
EVOLUTION_API_KEY=your-evolution-key

# Webhook (for Evolution callbacks)
WEBHOOK_BASE_URL=https://api.yourdomain.com

# OpenRouter
OPENROUTER_API_KEY=your-openrouter-key

# Pinecone
PINECONE_API_KEY=your-pinecone-key
PINECONE_REGION=us
PINECONE_INDEX=ffcs

# Alibaba Cloud DashScope
DASHSCOPE_API_KEY=your-dashscope-key

# Email (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=noreply@yourdomain.com
```

## Quick Fix Script

Run this on your VPS (replace `yourdomain.com` with your actual domain):

```bash
#!/bin/bash
DOMAIN="yourdomain.com"
API_DOMAIN="api.${DOMAIN}"

cd /var/www/ffcs/backend

# Backup current .env
cp .env .env.backup

# Update BACKEND_PUBLIC_URL
sed -i "s|BACKEND_PUBLIC_URL=.*|BACKEND_PUBLIC_URL=https://${API_DOMAIN}|" .env

# Update CORS_ORIGIN if exists, otherwise add it
if grep -q "CORS_ORIGIN=" .env; then
    sed -i "s|CORS_ORIGIN=.*|CORS_ORIGIN=https://${DOMAIN}|" .env
else
    echo "CORS_ORIGIN=https://${DOMAIN}" >> .env
fi

# Update APP_URL if exists, otherwise add it
if grep -q "APP_URL=" .env; then
    sed -i "s|APP_URL=.*|APP_URL=https://${DOMAIN}|" .env
else
    echo "APP_URL=https://${DOMAIN}" >> .env
fi

# Ensure uploads directory exists with correct permissions
mkdir -p uploads/logos
chmod -R 755 uploads/

# Restart backend
pm2 restart ffcs-backend

echo "✅ Configuration updated!"
echo "Backend will now return: https://${API_DOMAIN}/uploads/logos/..."
echo ""
echo "Check logs: pm2 logs ffcs-backend"
```

Save this as `fix-avatar-upload.sh`, make it executable, and run it:

```bash
chmod +x fix-avatar-upload.sh
./fix-avatar-upload.sh
```
