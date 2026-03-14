#!/bin/bash

# FFCS Backup Script
# Creates backups of database and uploads

set -e

BACKUP_DIR="/var/backups/ffcs"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=7

# Colors
GREEN='\033[0;32m'
NC='\033[0m'

echo "🔄 Starting FFCS backup..."

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup MongoDB
echo "Backing up MongoDB..."
mongodump --db=ffcs --out=$BACKUP_DIR/mongo_$DATE --quiet
tar -czf $BACKUP_DIR/mongo_$DATE.tar.gz -C $BACKUP_DIR mongo_$DATE
rm -rf $BACKUP_DIR/mongo_$DATE

# Backup uploads folder
echo "Backing up uploads..."
tar -czf $BACKUP_DIR/uploads_$DATE.tar.gz -C /var/www/ffcs/backend uploads

# Backup environment files
echo "Backing up configuration..."
mkdir -p $BACKUP_DIR/config_$DATE
cp /var/www/ffcs/backend/.env $BACKUP_DIR/config_$DATE/backend.env 2>/dev/null || true
cp /var/www/ffcs/frontend/.env.production $BACKUP_DIR/config_$DATE/frontend.env 2>/dev/null || true
tar -czf $BACKUP_DIR/config_$DATE.tar.gz -C $BACKUP_DIR config_$DATE
rm -rf $BACKUP_DIR/config_$DATE

# Remove old backups
echo "Cleaning up old backups..."
find $BACKUP_DIR -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete

# List backups
echo -e "${GREEN}✓${NC} Backup completed!"
echo "Backup location: $BACKUP_DIR"
du -sh $BACKUP_DIR/*_$DATE.tar.gz

# Optional: Upload to remote storage (uncomment if needed)
# aws s3 sync $BACKUP_DIR s3://your-bucket/ffcs-backups/
# rclone sync $BACKUP_DIR remote:ffcs-backups
