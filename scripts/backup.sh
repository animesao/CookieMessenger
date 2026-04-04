#!/bin/bash

# CookieMessenger Backup Script
# Автоматический бэкап базы данных и файлов проекта

set -e

# Настройки
PROJECT_DIR="/var/www/CookieMessenger"
BACKUP_DIR="/root/backups/messenger"
DB_PATH="$PROJECT_DIR/messenger/server/messenger.db"
KEEP_DAYS=7

# Создать директорию для бэкапов
mkdir -p "$BACKUP_DIR"

# Дата и время для имени файла
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
DATE=$(date +%Y-%m-%d)

echo "=== CookieMessenger Backup Started: $(date) ==="

# 1. Бэкап базы данных
echo "Backing up database..."
if [ -f "$DB_PATH" ]; then
    cp "$DB_PATH" "$BACKUP_DIR/messenger-db-$TIMESTAMP.db"
    echo "✓ Database backed up: messenger-db-$TIMESTAMP.db"
else
    echo "✗ Database not found at $DB_PATH"
fi

# 2. Бэкап всего проекта (архив)
echo "Creating project archive..."
cd /var/www
tar -czf "$BACKUP_DIR/messenger-full-$TIMESTAMP.tar.gz" \
    --exclude='node_modules' \
    --exclude='dist' \
    --exclude='.git' \
    CookieMessenger/
echo "✓ Project archived: messenger-full-$TIMESTAMP.tar.gz"

# 3. Размер бэкапов
DB_SIZE=$(du -h "$BACKUP_DIR/messenger-db-$TIMESTAMP.db" | cut -f1)
ARCHIVE_SIZE=$(du -h "$BACKUP_DIR/messenger-full-$TIMESTAMP.tar.gz" | cut -f1)
echo "Database backup size: $DB_SIZE"
echo "Archive backup size: $ARCHIVE_SIZE"

# 4. Удалить старые бэкапы (старше KEEP_DAYS дней)
echo "Cleaning old backups (older than $KEEP_DAYS days)..."
find "$BACKUP_DIR" -name "messenger-*" -mtime +$KEEP_DAYS -delete
echo "✓ Old backups cleaned"

# 5. Список всех бэкапов
echo ""
echo "Available backups:"
ls -lh "$BACKUP_DIR" | grep messenger

echo ""
echo "=== Backup Completed: $(date) ==="
echo "Backup location: $BACKUP_DIR"
