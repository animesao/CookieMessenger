#!/bin/bash
set -e

BASE=/var/www/CookieMessenger

echo "=== Pulling latest code ==="
cd $BASE
git pull origin main

echo "=== Building client ==="
cd $BASE/messenger/client
npm run build --legacy-peer-deps

echo "=== Copying build to deploy ==="
rm -rf $BASE/deploy/client/dist/*
cp -r $BASE/messenger/client/dist/* $BASE/deploy/client/dist/

echo "=== Restarting server ==="
pm2 restart rlc

echo "=== Done! ==="
echo "Build files:"
ls $BASE/deploy/client/dist/assets/
