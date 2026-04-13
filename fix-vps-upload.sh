#!/bin/bash
# Quick fix script for avatar upload on VPS
# Run this on your VPS server

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔧 Foodflow avatar upload fix${NC}"
echo ""

# Check if running on VPS (check if in correct directory)
if [ ! -d "/var/www/ffcs/backend" ]; then
    echo -e "${RED}❌ Error: /var/www/ffcs/backend not found${NC}"
    echo "This script should be run on your VPS server"
    exit 1
fi

cd /var/www/ffcs/backend

# Check if .env exists
if [ ! -f ".env" ]; then
    echo -e "${RED}❌ Error: .env file not found${NC}"
    echo "Please create /var/www/ffcs/backend/.env first"
    exit 1
fi

# Prompt for domain if not provided
if [ -z "$1" ]; then
    echo -e "${YELLOW}⚠ No domain provided${NC}"
    echo ""
    echo "Usage: $0 yourdomain.com"
    echo ""
    read -p "Enter your domain (e.g., example.com): " DOMAIN
    if [ -z "$DOMAIN" ]; then
        echo -e "${RED}❌ Domain is required${NC}"
        exit 1
    fi
else
    DOMAIN="$1"
fi

API_DOMAIN="api.${DOMAIN}"

echo ""
echo -e "${GREEN}📋 Configuration:${NC}"
echo "  Domain: https://${DOMAIN}"
echo "  API: https://${API_DOMAIN}"
echo ""
read -p "Is this correct? (y/n): " CONFIRM

if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo "Aborted."
    exit 0
fi

echo ""
echo -e "${GREEN}📝 Updating backend .env file...${NC}"

# Backup current .env
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
echo "  ✓ Backed up .env"

# Update or add BACKEND_PUBLIC_URL
if grep -q "^BACKEND_PUBLIC_URL=" .env; then
    sed -i "s|^BACKEND_PUBLIC_URL=.*|BACKEND_PUBLIC_URL=https://${API_DOMAIN}|" .env
    echo "  ✓ Updated BACKEND_PUBLIC_URL"
else
    echo "BACKEND_PUBLIC_URL=https://${API_DOMAIN}" >> .env
    echo "  ✓ Added BACKEND_PUBLIC_URL"
fi

# Update or add CORS_ORIGIN
if grep -q "^CORS_ORIGIN=" .env; then
    sed -i "s|^CORS_ORIGIN=.*|CORS_ORIGIN=https://${DOMAIN}|" .env
    echo "  ✓ Updated CORS_ORIGIN"
else
    echo "CORS_ORIGIN=https://${DOMAIN}" >> .env
    echo "  ✓ Added CORS_ORIGIN"
fi

# Update or add APP_URL
if grep -q "^APP_URL=" .env; then
    sed -i "s|^APP_URL=.*|APP_URL=https://${DOMAIN}|" .env
    echo "  ✓ Updated APP_URL"
else
    echo "APP_URL=https://${DOMAIN}" >> .env
    echo "  ✓ Added APP_URL"
fi

echo ""
echo -e "${GREEN}📁 Setting up uploads directory...${NC}"

# Create uploads directory if it doesn't exist
mkdir -p uploads/logos
echo "  ✓ Created uploads/logos directory"

# Set permissions
chmod -R 755 uploads/
echo "  ✓ Set directory permissions"

echo ""
echo -e "${GREEN}🔄 Restarting backend...${NC}"

# Restart PM2
pm2 restart ffcs-backend || {
    echo -e "${RED}❌ Failed to restart backend${NC}"
    echo "Try manually: pm2 restart ffcs-backend"
    exit 1
}

echo "  ✓ Backend restarted"

echo ""
echo -e "${GREEN}✅ Fix applied successfully!${NC}"
echo ""
echo -e "${BLUE}📊 Verification:${NC}"
echo "  1. Check backend logs: pm2 logs ffcs-backend --lines 20"
echo "  2. Test upload at: https://${DOMAIN}/settings/profile"
echo "  3. Avatar URL should be: https://${API_DOMAIN}/uploads/logos/xxx.png"
echo ""
echo -e "${YELLOW}💡 Tip:${NC} Check logs with: pm2 logs ffcs-backend"
