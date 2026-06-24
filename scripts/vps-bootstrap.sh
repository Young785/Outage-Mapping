#!/usr/bin/env bash
# One-time Hostinger VPS setup. Run as root on Ubuntu 24.04:
#   curl -fsSL ... | bash   OR   bash scripts/vps-bootstrap.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/stormtrackertool}"
REPO_URL="${REPO_URL:-https://github.com/wkrausepersonal-wq/stormtrackertool.git}"
DOMAIN="${DOMAIN:-stormtrackertool.com}"

echo "==> System packages"
apt-get update -qq
apt-get install -y -qq curl git nginx

echo "==> Node.js 20"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi

echo "==> PM2"
npm install -g pm2
pm2 startup systemd -u root --hp /root 2>/dev/null || true

echo "==> Clone app"
mkdir -p "$(dirname "$APP_DIR")"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"

if [ ! -f .env ]; then
  cp .env.example .env
  echo ""
  echo "!! Copy production secrets into $APP_DIR/.env (APP_ENV=production, *_PROD keys)"
fi

chmod +x scripts/deploy-vps.sh scripts/vps-bootstrap.sh

echo "==> Nginx site"
cat > "/etc/nginx/sites-available/$DOMAIN" <<NGINX
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX

ln -sf "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/$DOMAIN"
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "==> First deploy"
bash scripts/deploy-vps.sh

echo ""
echo "Done. Point DNS A record for $DOMAIN to this server's IP."
echo "Then: certbot --nginx -d $DOMAIN -d www.$DOMAIN"
echo "Add GitHub Actions secrets: VPS_HOST, VPS_USER, VPS_SSH_KEY, VPS_APP_DIR=$APP_DIR"
