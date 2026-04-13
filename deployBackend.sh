#!/bin/bash

# Foodflow backend deployment script
# This script automates the backend deployment process

set -e  # Exit on error

echo "🚀 Starting Foodflow backend deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# GitHub credentials
GIT_USERNAME="kennyforex"
GIT_TOKEN="${GIT_TOKEN:-YOUR_GITHUB_TOKEN_HERE}"

# Detect the actual user (even when using sudo)
if [ -n "$SUDO_USER" ]; then
    ACTUAL_USER="$SUDO_USER"
    print_status "Running with sudo, using PM2 from user: $ACTUAL_USER"
    PM2_CMD="sudo -u $ACTUAL_USER pm2"
else
    ACTUAL_USER="$(whoami)"
    PM2_CMD="pm2"
fi

# Navigate to app directory
print_status "Navigating to /var/www/ffcs..."
cd /var/www/ffcs

# Pull latest changes with credentials
if [ -d ".git" ]; then
    print_status "Pulling latest changes from Git..."
    
    # Get the current remote URL
    REMOTE_URL=$(git config --get remote.origin.url)
    
    # Check if URL already has credentials
    if [[ $REMOTE_URL == https://* ]]; then
        # Extract the repo path (e.g., github.com/user/repo.git)
        REPO_PATH=$(echo $REMOTE_URL | sed 's|https://||' | sed 's|.*@||')
        
        # Construct URL with credentials
        AUTH_URL="https://${GIT_USERNAME}:${GIT_TOKEN}@${REPO_PATH}"
        
        # Pull using the authenticated URL
        git pull $AUTH_URL main || git pull $AUTH_URL master || {
            print_error "Git pull failed"
            exit 1
        }
    else
        # If SSH or other protocol, try normal pull
        git pull || {
            print_error "Git pull failed"
            exit 1
        }
    fi
    
    print_status "Successfully pulled latest changes"
else
    print_error "Not a Git repository"
    exit 1
fi

# Restart PM2 for backend only
print_status "Restarting backend application..."
$PM2_CMD restart ffcs-backend || {
    print_error "PM2 restart failed"
    exit 1
}

# Check PM2 status
print_status "Checking backend status..."
$PM2_CMD status ffcs-backend

print_status "Backend deployment completed successfully! 🎉"
print_status ""
if [ -n "$SUDO_USER" ]; then
    print_status "To view backend logs, run: sudo -u $ACTUAL_USER pm2 logs ffcs-backend"
    print_status "To monitor: sudo -u $ACTUAL_USER pm2 monit"
else
    print_status "To view backend logs, run: pm2 logs ffcs-backend"
    print_status "To monitor: pm2 monit"
fi
