#!/bin/bash
# ─── Butchery Pro — VPS Deployment Script ────────────────────────────────────
# Run from your local machine:  bash deploy/deploy.sh
#
# Prerequisites on VPS:
#   - Node.js 20+ installed
#   - PM2 installed globally: npm install -g pm2
#   - nginx installed
#   - SSL certificate via Certbot

set -e

VPS_USER="root"
VPS_HOST="butchery.sidanitsolutions.com"
VPS_DIR="/var/www/butchery"
BACKEND_DIR="$(dirname "$0")/../backend"

echo "==> Deploying Butchery Pro backend to $VPS_HOST..."

# 1. Create directory on VPS
ssh "$VPS_USER@$VPS_HOST" "mkdir -p $VPS_DIR/backend/services $VPS_DIR/backend/config $VPS_DIR/backend/routes $VPS_DIR/data"

# 2. Upload backend files (exclude node_modules and local DB)
echo "==> Uploading backend files..."
rsync -avz --progress \
  --exclude 'node_modules' \
  --exclude '*.db' \
  --exclude '*.db-shm' \
  --exclude '*.db-wal' \
  --exclude '.env' \
  --exclude 'uploads' \
  "$BACKEND_DIR/" "$VPS_USER@$VPS_HOST:$VPS_DIR/backend/"

# 3. Upload .env for VPS (create it from template if missing)
if [ -f "$BACKEND_DIR/.env.vps" ]; then
  echo "==> Uploading .env.vps as .env..."
  scp "$BACKEND_DIR/.env.vps" "$VPS_USER@$VPS_HOST:$VPS_DIR/backend/.env"
else
  echo "!! WARNING: No .env.vps found. Make sure $VPS_DIR/backend/.env exists on the VPS."
fi

# 4. Install/update Node.js dependencies on VPS
echo "==> Installing dependencies on VPS..."
ssh "$VPS_USER@$VPS_HOST" "cd $VPS_DIR/backend && npm install --omit=dev && npm rebuild better-sqlite3"

# 5. Restart with PM2
echo "==> Restarting with PM2..."
ssh "$VPS_USER@$VPS_HOST" "cd $VPS_DIR/backend && pm2 delete butchery-vps 2>/dev/null || true && pm2 start ecosystem.config.js && pm2 save"

# 6. Copy and reload nginx config
echo "==> Updating nginx config..."
scp "$(dirname "$0")/nginx.conf" "$VPS_USER@$VPS_HOST:/etc/nginx/sites-available/butchery"
ssh "$VPS_USER@$VPS_HOST" "ln -sf /etc/nginx/sites-available/butchery /etc/nginx/sites-enabled/butchery && nginx -t && systemctl reload nginx"

echo ""
echo "✓  Deployment complete!"
echo "   Test: curl https://$VPS_HOST/api/health"
