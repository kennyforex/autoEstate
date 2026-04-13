#!/bin/bash

# Foodflow frontend deployment script
# This script automates the frontend deployment process

set -e  # Exit on error

echo "🚀 Starting Foodflow frontend deployment..."

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

# Build frontend
print_status "Building frontend..."
cd frontend

print_status "Running Vite build..."
npx vite build || {
    print_error "Frontend build failed"
    exit 1
}

# Copy dist to production directory
print_status "Copying built files to /var/www/ffcs-frontend/..."
sudo cp -r dist/* /var/www/ffcs-frontend/ || {
    print_error "Failed to copy files to production directory"
    exit 1
}

print_status "Frontend deployment completed successfully! 🎉"
print_status ""
print_status "Frontend files deployed to: /var/www/ffcs-frontend/"
