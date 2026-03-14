#!/bin/bash
# Fix backend URL for ffcs.hkfinch.com
# Run this on your VPS

set -e

echo "🔧 Fixing BACKEND_PUBLIC_URL..."
echo ""

cd /var/www/ffcs/backend

# Check current value
echo "Current BACKEND_PUBLIC_URL:"
grep "BACKEND_PUBLIC_URL" .env || echo "(not set)"
echo ""

# Backup
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
echo "✓ Backed up .env"

# Remove old BACKEND_PUBLIC_URL if exists
sed -i '/^BACKEND_PUBLIC_URL=/d' .env

# Add correct value
echo "BACKEND_PUBLIC_URL=https://api.ffcs.hkfinch.com" >> .env
echo "✓ Set BACKEND_PUBLIC_URL=https://api.ffcs.hkfinch.com"

# Also ensure WEBHOOK_BASE_URL is correct for Evolution API
if grep -q "^WEBHOOK_BASE_URL=" .env; then
    sed -i "s|^WEBHOOK_BASE_URL=.*|WEBHOOK_BASE_URL=https://api.ffcs.hkfinch.com|" .env
else
    echo "WEBHOOK_BASE_URL=https://api.ffcs.hkfinch.com" >> .env
fi
echo "✓ Set WEBHOOK_BASE_URL=https://api.ffcs.hkfinch.com"

echo ""
echo "New configuration:"
grep -E "(BACKEND_PUBLIC_URL|WEBHOOK_BASE_URL|CORS_ORIGIN|APP_URL)" .env
echo ""

# Restart PM2
echo "🔄 Restarting backend..."
pm2 restart ffcs-backend

echo ""
echo "✅ Done! Wait 5 seconds for restart..."
sleep 5

echo ""
echo "📊 Checking logs..."
pm2 logs ffcs-backend --lines 10 --nostream

echo ""
echo "✅ Backend should now return: https://api.ffcs.hkfinch.com/uploads/logos/xxx.png"
echo ""
echo "Try uploading again!"
