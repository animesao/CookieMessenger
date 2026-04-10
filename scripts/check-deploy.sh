#!/bin/bash
# Check if username change feature is deployed

echo "🔍 Checking deploy files..."

if grep -q "change-username" /var/www/CookieMessenger/deploy/client/dist/assets/index-*.js; then
    echo "✅ Username change feature found in client build"
else
    echo "❌ Username change feature NOT found in client build"
fi

if grep -q "change-username" /var/www/CookieMessenger/deploy/routes/settings.js; then
    echo "✅ Username change endpoint found in server"
else
    echo "❌ Username change endpoint NOT found in server"
fi

echo ""
echo "📝 Server route check:"
grep -A 5 "change-username" /var/www/CookieMessenger/deploy/routes/settings.js | head -10
