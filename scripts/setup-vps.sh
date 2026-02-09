#!/bin/bash
# ===========================================
# SquadX Live - VPS Setup Script (All-in-One)
# ===========================================
# Run this on your VPS as root
# Usage: ./setup-vps.sh
# ===========================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Check for root
if [ "$EUID" -ne 0 ]; then
  error "Please run as root: sudo ./setup-vps.sh"
fi

echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  SquadX Live - VPS Setup${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# Detect external IP
EXTERNAL_IP=$(curl -s ifconfig.me 2>/dev/null || curl -s icanhazip.com 2>/dev/null)
info "Detected IP: $EXTERNAL_IP"

# ===========================================
# 1. System Updates & Dependencies
# ===========================================
info "Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq

info "Installing dependencies..."
apt-get install -y -qq \
  curl wget git vim htop tmux \
  ufw fail2ban \
  coturn \
  debian-keyring debian-archive-keyring apt-transport-https

# ===========================================
# 2. Install Caddy (Reverse Proxy + Auto SSL)
# ===========================================
if ! command -v caddy &> /dev/null; then
  info "Installing Caddy..."
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy
  success "Caddy installed"
else
  success "Caddy already installed"
fi

# ===========================================
# 3. Install Node.js 24
# ===========================================
if ! command -v node &> /dev/null || [[ $(node -v | cut -d'.' -f1 | tr -d 'v') -lt 24 ]]; then
  info "Installing Node.js 24..."
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y -qq nodejs
  success "Node.js $(node -v) installed"
else
  success "Node.js $(node -v) already installed"
fi

# Install pnpm
if ! command -v pnpm &> /dev/null; then
  info "Installing pnpm..."
  npm install -g pnpm
  success "pnpm installed"
fi

# ===========================================
# 4. Configure Firewall
# ===========================================
info "Configuring firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing

# SSH
ufw allow 22/tcp

# HTTP/HTTPS (Caddy)
ufw allow 80/tcp
ufw allow 443/tcp

# TURN/STUN
ufw allow 3478/tcp
ufw allow 3478/udp
ufw allow 5349/tcp
ufw allow 5349/udp

# TURN relay ports
ufw allow 49152:49252/udp

# LiveKit
ufw allow 7880/tcp
ufw allow 7881/tcp
ufw allow 7882/udp
ufw allow 50000:50200/udp

ufw --force enable
success "Firewall configured"

# ===========================================
# 5. Create App Directory
# ===========================================
APP_DIR="/opt/squadx-live"
mkdir -p $APP_DIR
cd $APP_DIR

# ===========================================
# 6. Configure TURN Server (coturn)
# ===========================================
info "Configuring TURN server..."

# Generate random password if not exists
TURN_PASSWORD_FILE="$APP_DIR/.turn-password"
if [ ! -f "$TURN_PASSWORD_FILE" ]; then
  TURN_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)
  echo "$TURN_PASSWORD" > "$TURN_PASSWORD_FILE"
  chmod 600 "$TURN_PASSWORD_FILE"
else
  TURN_PASSWORD=$(cat "$TURN_PASSWORD_FILE")
fi

cat > /etc/turnserver.conf << EOF
# SquadX Live TURN Server Configuration
listening-port=3478
tls-listening-port=5349
min-port=49152
max-port=49252
external-ip=$EXTERNAL_IP
realm=turn.live.squadx.dev
server-name=turn.live.squadx.dev
lt-cred-mech
user=squadx:$TURN_PASSWORD
no-cli
fingerprint
no-multicast-peers
no-loopback-peers
EOF

systemctl enable coturn
systemctl restart coturn
success "TURN server configured (password in $TURN_PASSWORD_FILE)"

# ===========================================
# 7. Configure LiveKit
# ===========================================
info "Configuring LiveKit SFU..."

LIVEKIT_DIR="$APP_DIR/livekit"
mkdir -p $LIVEKIT_DIR

# Generate API keys if not exists
LIVEKIT_KEYS_FILE="$APP_DIR/.livekit-keys"
if [ ! -f "$LIVEKIT_KEYS_FILE" ]; then
  LIVEKIT_API_KEY="API$(openssl rand -hex 8)"
  LIVEKIT_API_SECRET=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
  echo "LIVEKIT_API_KEY=$LIVEKIT_API_KEY" > "$LIVEKIT_KEYS_FILE"
  echo "LIVEKIT_API_SECRET=$LIVEKIT_API_SECRET" >> "$LIVEKIT_KEYS_FILE"
  chmod 600 "$LIVEKIT_KEYS_FILE"
else
  source "$LIVEKIT_KEYS_FILE"
fi

cat > $LIVEKIT_DIR/livekit.yaml << EOF
port: 7880
rtc:
  port_range_start: 50000
  port_range_end: 50200
  tcp_port: 7881
  udp_port: 7882
  use_external_ip: true
  node_ip: $EXTERNAL_IP
turn:
  enabled: true
  domain: turn.live.squadx.dev
  tls_port: 5349
  udp_port: 3478
  external_tls: true
keys:
  $LIVEKIT_API_KEY: $LIVEKIT_API_SECRET
logging:
  level: info
EOF

cat > $LIVEKIT_DIR/docker-compose.yml << EOF
version: '3.8'
services:
  livekit:
    image: livekit/livekit-server:latest
    container_name: squadx-livekit
    restart: unless-stopped
    network_mode: host
    volumes:
      - ./livekit.yaml:/etc/livekit.yaml
    command: --config /etc/livekit.yaml
EOF

cd $LIVEKIT_DIR
docker compose up -d
success "LiveKit SFU configured (keys in $LIVEKIT_KEYS_FILE)"

# ===========================================
# 8. Configure Caddy (Reverse Proxy)
# ===========================================
info "Configuring Caddy reverse proxy..."

cat > /etc/caddy/Caddyfile << 'EOF'
# SquadX Live - Caddy Configuration

live.squadx.dev {
  reverse_proxy localhost:3000
}

sfu.live.squadx.dev {
  reverse_proxy localhost:7880
}

turn.live.squadx.dev {
  respond "SquadX Live TURN Server" 200
}
EOF

systemctl restart caddy
success "Caddy configured with auto-SSL"

# ===========================================
# 9. Create Environment File
# ===========================================
info "Creating environment file..."

ENV_FILE="$APP_DIR/.env"
cat > $ENV_FILE << EOF
# SquadX Live Environment Configuration
# Generated on $(date)

# Supabase (FILL THESE IN)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# TURN Server
TURN_SERVER_URL=turn:turn.live.squadx.dev:3478
TURN_SERVER_USERNAME=squadx
TURN_SERVER_CREDENTIAL=$TURN_PASSWORD
TURNS_SERVER_URL=turns:turn.live.squadx.dev:5349

# LiveKit
LIVEKIT_API_KEY=$LIVEKIT_API_KEY
LIVEKIT_API_SECRET=$LIVEKIT_API_SECRET
NEXT_PUBLIC_LIVEKIT_URL=wss://sfu.live.squadx.dev

# App
NEXT_PUBLIC_APP_URL=https://live.squadx.dev
NODE_ENV=production
EOF

chmod 600 $ENV_FILE
success "Environment file created at $ENV_FILE"

# ===========================================
# 10. Summary
# ===========================================
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  SquadX Live VPS Setup Complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "${BLUE}Services configured:${NC}"
echo "  - Caddy (reverse proxy + SSL)"
echo "  - TURN server (coturn) on port 3478/5349"
echo "  - LiveKit SFU on port 7880"
echo ""
echo -e "${BLUE}Domains:${NC}"
echo "  - https://live.squadx.dev (web app - needs deploy)"
echo "  - https://sfu.live.squadx.dev (LiveKit)"
echo "  - turn.live.squadx.dev:3478 (TURN)"
echo ""
echo -e "${BLUE}Credentials saved in:${NC}"
echo "  - $TURN_PASSWORD_FILE"
echo "  - $LIVEKIT_KEYS_FILE"
echo "  - $ENV_FILE"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Edit $ENV_FILE with your Supabase credentials"
echo "  2. Clone and deploy the web app:"
echo "     cd $APP_DIR"
echo "     git clone https://github.com/squadx/squadx-live.git app"
echo "     cd app && pnpm install && pnpm build:web"
echo "     pm2 start 'pnpm start:web' --name squadx-web"
echo ""
echo -e "${BLUE}Test TURN server:${NC}"
echo "  turnutils_uclient -t -u squadx -w $TURN_PASSWORD turn.live.squadx.dev"
echo ""
