#!/bin/bash

# SSL Setup Script for CookieMessenger
# Automatically configures HTTPS using Let's Encrypt (Certbot)

set -e

echo "🔒 SSL Setup для CookieMessenger"
echo "================================"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
  echo "❌ Запустите скрипт с правами root: sudo bash scripts/setup-ssl.sh"
  exit 1
fi

# Get domain
read -p "Введите ваш домен (например, rulinux.su): " DOMAIN

if [ -z "$DOMAIN" ]; then
  echo "❌ Домен не может быть пустым"
  exit 1
fi

# Get email for Let's Encrypt
read -p "Введите email для уведомлений Let's Encrypt: " EMAIL

if [ -z "$EMAIL" ]; then
  echo "❌ Email не может быть пустым"
  exit 1
fi

echo ""
echo "📦 Установка Certbot..."

# Install Certbot
if ! command -v certbot &> /dev/null; then
  apt-get update
  apt-get install -y certbot python3-certbot-nginx
  echo "✓ Certbot установлен"
else
  echo "✓ Certbot уже установлен"
fi

echo ""
echo "🌐 Настройка Nginx..."

# Create Nginx config for the domain
NGINX_CONF="/etc/nginx/sites-available/$DOMAIN"

cat > "$NGINX_CONF" << EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN www.$DOMAIN;

    # Let's Encrypt verification
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Redirect all HTTP to HTTPS
    location / {
        return 301 https://\$server_name\$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $DOMAIN www.$DOMAIN;

    # SSL certificates (will be added by Certbot)
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Root directory
    root /var/www/CookieMessenger/messenger/client/dist;
    index index.html;

    # WebSocket support
    location /ws {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400;
    }

    # API proxy
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        client_max_body_size 100M;
    }

    # Static files
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF

echo "✓ Nginx конфиг создан: $NGINX_CONF"

# Enable site
ln -sf "$NGINX_CONF" "/etc/nginx/sites-enabled/$DOMAIN"

# Remove default if exists
if [ -f "/etc/nginx/sites-enabled/default" ]; then
  rm -f /etc/nginx/sites-enabled/default
  echo "✓ Удален default конфиг"
fi

# Test Nginx config
echo ""
echo "🔍 Проверка конфигурации Nginx..."
nginx -t

echo ""
echo "🔄 Перезагрузка Nginx..."
systemctl reload nginx

echo ""
echo "🔐 Получение SSL сертификата..."
echo "Это может занять минуту..."

# Get SSL certificate
certbot certonly --nginx \
  --non-interactive \
  --agree-tos \
  --email "$EMAIL" \
  -d "$DOMAIN" \
  -d "www.$DOMAIN"

if [ $? -eq 0 ]; then
  echo ""
  echo "✓ SSL сертификат успешно получен!"
  
  # Reload Nginx with SSL
  systemctl reload nginx
  
  echo ""
  echo "✅ HTTPS настроен успешно!"
  echo ""
  echo "🌐 Ваш сайт доступен по адресу: https://$DOMAIN"
  echo "🔒 Весь трафик теперь шифруется"
  echo ""
  echo "📝 Автопродление сертификата настроено автоматически"
  echo "   Certbot будет обновлять сертификат каждые 60 дней"
  echo ""
  echo "🔧 Не забудьте обновить .env файлы:"
  echo "   - Измените все http:// на https://"
  echo "   - Обновите DISCORD_REDIRECT_URI на https://$DOMAIN/api/auth/discord/callback"
  echo "   - Перезапустите сервер: pm2 restart rlc"
  
else
  echo ""
  echo "❌ Ошибка при получении SSL сертификата"
  echo "Проверьте:"
  echo "  1. DNS записи для $DOMAIN указывают на этот сервер"
  echo "  2. Порты 80 и 443 открыты в файрволе"
  echo "  3. Nginx запущен и работает"
  exit 1
fi
