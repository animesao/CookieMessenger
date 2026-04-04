# CookieMessenger Backup Scripts

Скрипты для автоматического бэкапа и восстановления проекта.

## Установка

На сервере выполни:

```bash
cd /var/www/CookieMessenger
git pull

# Сделать скрипты исполняемыми
chmod +x scripts/backup.sh
chmod +x scripts/restore.sh

# Создать символические ссылки для удобства
ln -sf /var/www/CookieMessenger/scripts/backup.sh /usr/local/bin/messenger-backup
ln -sf /var/www/CookieMessenger/scripts/restore.sh /usr/local/bin/messenger-restore
```

## Использование

### Ручной бэкап

```bash
messenger-backup
# или
/var/www/CookieMessenger/scripts/backup.sh
```

### Восстановление

```bash
messenger-restore
# или
/var/www/CookieMessenger/scripts/restore.sh
```

### Автоматический бэкап (каждый день в 3 ночи)

```bash
# Открыть crontab
crontab -e

# Добавить строку:
0 3 * * * /var/www/CookieMessenger/scripts/backup.sh >> /var/log/messenger-backup.log 2>&1
```

## Где хранятся бэкапы

Все бэкапы сохраняются в `/root/backups/messenger/`

- `messenger-db-ДАТА.db` - только база данных
- `messenger-full-ДАТА.tar.gz` - полный архив проекта

Старые бэкапы (старше 7 дней) удаляются автоматически.

## Скачать бэкап на локальный компьютер

```bash
# На твоём компе (замени IP)
scp root@твой-ip:/root/backups/messenger/messenger-full-*.tar.gz ~/Desktop/
```

## Что включено в бэкап

- База данных SQLite
- Серверный код
- Клиентский код
- Конфигурационные файлы
- Загруженные файлы (аватары, медиа)

**Исключено:**
- node_modules (можно восстановить через npm install)
- dist (можно пересобрать через npm run build)
- .git (уже на GitHub)

## Восстановление на новом сервере

```bash
# 1. Скачать бэкап
scp root@старый-сервер:/root/backups/messenger/messenger-full-ДАТА.tar.gz /tmp/

# 2. Распаковать
cd /var/www
tar -xzf /tmp/messenger-full-ДАТА.tar.gz

# 3. Установить зависимости
cd CookieMessenger/messenger/server
npm install

cd ../client
npm install
npm run build

# 4. Настроить PM2
pm2 start /var/www/CookieMessenger/messenger/server/index.js --name rlc
pm2 save
```
