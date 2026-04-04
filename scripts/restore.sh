#!/bin/bash

# CookieMessenger Restore Script
# Восстановление из бэкапа

set -e

BACKUP_DIR="/root/backups/messenger"
PROJECT_DIR="/var/www/CookieMessenger"

echo "=== CookieMessenger Restore ==="
echo ""

# Показать доступные бэкапы
echo "Available backups:"
ls -lh "$BACKUP_DIR" | grep messenger | nl
echo ""

# Запросить выбор
read -p "Enter backup filename to restore (or 'cancel'): " BACKUP_FILE

if [ "$BACKUP_FILE" = "cancel" ]; then
    echo "Restore cancelled"
    exit 0
fi

BACKUP_PATH="$BACKUP_DIR/$BACKUP_FILE"

if [ ! -f "$BACKUP_PATH" ]; then
    echo "✗ Backup file not found: $BACKUP_PATH"
    exit 1
fi

# Подтверждение
echo ""
echo "⚠️  WARNING: This will replace current project files!"
read -p "Are you sure? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Restore cancelled"
    exit 0
fi

echo ""
echo "Starting restore..."

# Остановить PM2
echo "Stopping PM2 process..."
pm2 stop rlc || true

# Создать бэкап текущего состояния
echo "Creating safety backup of current state..."
SAFETY_BACKUP="/root/backups/messenger/safety-backup-$(date +%Y%m%d-%H%M%S).tar.gz"
cd /var/www
tar -czf "$SAFETY_BACKUP" CookieMessenger/ || true
echo "✓ Safety backup created: $SAFETY_BACKUP"

# Восстановление
if [[ "$BACKUP_FILE" == *".db" ]]; then
    # Восстановление только БД
    echo "Restoring database..."
    cp "$BACKUP_PATH" "$PROJECT_DIR/messenger/server/messenger.db"
    echo "✓ Database restored"
else
    # Восстановление полного архива
    echo "Restoring full project..."
    cd /var/www
    rm -rf CookieMessenger.old || true
    mv CookieMessenger CookieMessenger.old || true
    tar -xzf "$BACKUP_PATH"
    echo "✓ Project restored"
fi

# Запустить PM2
echo "Starting PM2 process..."
pm2 start rlc

echo ""
echo "=== Restore Completed ==="
echo "Old files saved in: CookieMessenger.old (if full restore)"
