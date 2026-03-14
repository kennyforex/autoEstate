#!/bin/bash

# FFCS Deployment Script
# This script automates the deployment process

set -e  # Exit on error

echo "🚀 Starting FFCS deployment..."

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

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then 
    print_error "Please run as root or with sudo"
    exit 1
fi

# Navigate to app directory
cd /var/www/ffcs

# Pull latest changes (if using Git)
if [ -d ".git" ]; then
    print_status "Pulling latest changes from Git..."
    git pull origin main || {
        print_error "Git pull failed"
        exit 1
    }
else
    print_warning "Not a Git repository, skipping Git pull"
fi

# Backend deployment
print_status "Building backend..."
cd backend

# Install dependencies
print_status "Installing backend dependencies..."
npm install --production || {
    print_error "Backend npm install failed"
    exit 1
}

# Build TypeScript
print_status "Compiling TypeScript..."
npm run build || {
    print_error "Backend build failed"
    exit 1
}

# Frontend deployment
print_status "Building frontend..."
cd ../frontend

# Install dependencies
print_status "Installing frontend dependencies..."
npm install || {
    print_error "Frontend npm install failed"
    exit 1
}

# Build for production
print_status "Building frontend for production..."
npm run build || {
    print_error "Frontend build failed"
    exit 1
}

# Create logs directory if it doesn't exist
mkdir -p /var/www/ffcs/logs

# Restart PM2
print_status "Restarting application..."
pm2 restart all || {
    print_error "PM2 restart failed"
    exit 1
}

# Reload Nginx
print_status "Reloading Nginx..."
systemctl reload nginx || {
    print_warning "Nginx reload failed, but continuing..."
}

# Check PM2 status
print_status "Checking application status..."
pm2 status

print_status "Deployment completed successfully! 🎉"
print_status "Frontend: https://yourdomain.com"
print_status "Backend API: https://api.yourdomain.com"
print_status ""
print_status "To view logs, run: pm2 logs"
print_status "To monitor: pm2 monit"
