#!/bin/bash

# Setup TURN server (coturn) for WebRTC calls
# Run as root: sudo bash scripts/setup-turn.sh

set -e

echo "🔄 Installing coturn TURN server..."

# Install coturn
apt-get update
apt-get install -y coturn

# Enable coturn
sed -i 's/#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn

# Get server IP
SERVER_IP=$(curl -s ifconfig.me)
echo "📡 Server IP: $SERVER_IP"

# Generate random secret
TURN_SECRET=$(openssl rand -hex 16)

# Create coturn config
cat > /etc/turnserver.conf <<EOF
# TURN server for CookieMessenger WebRTC

# Listening port
listening-port=3478
tls-listening-port=5349

# External IP (your VDS IP)
external-ip=$SERVER_IP

# Relay IP (same as external)
relay-ip=$SERVER_IP

# Use fingerprints
fingerprint

# Use long-term credentials
lt-cred-mech

# User credentials (username:password)
user=cookiemessenger:$TURN_SECRET

# Realm
realm=rulinux.su

# Log file
log-file=/var/log/turnserver.log
verbose

# Deny private IP ranges (security)
no-multicast-peers
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255

# Quota (prevent abuse)
max-bps=1000000
bps-capacity=0
stale-nonce=600

# Disable TLS (we'll use port 3478 only for now)
no-tls
no-dtls
EOF

echo "✅ Coturn configured"
echo ""
echo "📝 TURN credentials:"
echo "   URL: turn:$SERVER_IP:3478"
echo "   Username: cookiemessenger"
echo "   Password: $TURN_SECRET"
echo ""
echo "⚠️  Add these to your CallManager.jsx ICE_SERVERS:"
echo ""
echo "  {"
echo "    urls: 'turn:$SERVER_IP:3478',"
echo "    username: 'cookiemessenger',"
echo "    credential: '$TURN_SECRET',"
echo "  },"
echo ""

# Open firewall ports
echo "🔓 Opening firewall ports..."
ufw allow 3478/tcp
ufw allow 3478/udp
ufw allow 5349/tcp
ufw allow 5349/udp
ufw allow 49152:65535/udp  # TURN relay ports

# Restart coturn
systemctl restart coturn
systemctl enable coturn

echo "✅ TURN server started!"
echo ""
echo "🧪 Test TURN server:"
echo "   https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/"
echo ""
echo "   Use these settings:"
echo "   STUN: stun:$SERVER_IP:3478"
echo "   TURN: turn:$SERVER_IP:3478"
echo "   Username: cookiemessenger"
echo "   Password: $TURN_SECRET"
