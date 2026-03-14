#!/bin/bash
# Quick deploy script for ffcs.hkfinch.com
# Upload this to your VPS and run it

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🚀 Deploying FFCS for ffcs.hkfinch.com${NC}"
echo ""

# Check if running on VPS
if [ ! -d "/var/www/ffcs/backend" ]; then
    echo -e "${RED}❌ Error: /var/www/ffcs/backend not found${NC}"
    echo "This script should be run on your VPS server"
    exit 1
fi

cd /var/www/ffcs/backend

# Check if .env exists
if [ ! -f ".env" ]; then
    echo -e "${RED}❌ Error: .env file not found${NC}"
    exit 1
fi

echo -e "${GREEN}📝 Updating backend .env...${NC}"

# Backup
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
echo "  ✓ Backed up .env"

# Update BACKEND_PUBLIC_URL
if grep -q "^BACKEND_PUBLIC_URL=" .env; then
    sed -i "s|^BACKEND_PUBLIC_URL=.*|BACKEND_PUBLIC_URL=https://api.ffcs.hkfinch.com|" .env
else
    echo "BACKEND_PUBLIC_URL=https://api.ffcs.hkfinch.com" >> .env
fi
echo "  ✓ Set BACKEND_PUBLIC_URL=https://api.ffcs.hkfinch.com"

# Update CORS_ORIGIN
if grep -q "^CORS_ORIGIN=" .env; then
    sed -i "s|^CORS_ORIGIN=.*|CORS_ORIGIN=https://ffcs.hkfinch.com|" .env
else
    echo "CORS_ORIGIN=https://ffcs.hkfinch.com" >> .env
fi
echo "  ✓ Set CORS_ORIGIN=https://ffcs.hkfinch.com"

# Update APP_URL
if grep -q "^APP_URL=" .env; then
    sed -i "s|^APP_URL=.*|APP_URL=https://ffcs.hkfinch.com|" .env
else
    echo "APP_URL=https://ffcs.hkfinch.com" >> .env
fi
echo "  ✓ Set APP_URL=https://ffcs.hkfinch.com"

# Ensure NODE_ENV is production
if grep -q "^NODE_ENV=" .env; then
    sed -i "s|^NODE_ENV=.*|NODE_ENV=production|" .env
else
    echo "NODE_ENV=production" >> .env
fi
echo "  ✓ Set NODE_ENV=production"

echo ""
echo -e "${GREEN}📁 Setting up uploads directory...${NC}"
mkdir -p uploads/logos
chmod -R 755 uploads/
echo "  ✓ Directory ready"

echo ""
echo -e "${GREEN}🔄 Restarting backend...${NC}"
pm2 restart ffcs-backend
echo "  ✓ Backend restarted"

echo ""
echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""
echo -e "${BLUE}📊 Next steps:${NC}"
echo "  1. Check logs: pm2 logs ffcs-backend --lines 30"
echo "  2. Test avatar upload: https://ffcs.hkfinch.com/settings/profile"
echo "  3. Avatar URLs should be: https://api.ffcs.hkfinch.com/uploads/logos/xxx.png"
echo ""
echo -e "${YELLOW}💡 Verify configuration:${NC}"
echo "  grep -E '(BACKEND_PUBLIC_URL|CORS_ORIGIN|APP_URL)' /var/www/ffcs/backend/.env"
