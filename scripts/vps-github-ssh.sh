#!/usr/bin/env bash
# Set up GitHub SSH access on the VPS (run once as root).
# GitHub does not accept account passwords for git — use a deploy key instead.
set -euo pipefail

KEY="$HOME/.ssh/github_stormtracker"
REPO="git@github.com:wkrausepersonal-wq/stormtrackertool.git"
APP_DIR="${APP_DIR:-/root/projects/stormtrackertool}"

mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"

if [ ! -f "$KEY" ]; then
  ssh-keygen -t ed25519 -C "vps-stormtracker-deploy" -f "$KEY" -N ""
fi

if ! grep -q "Host github.com" "$HOME/.ssh/config" 2>/dev/null; then
  cat >> "$HOME/.ssh/config" <<EOF

Host github.com
  HostName github.com
  User git
  IdentityFile $KEY
  IdentitiesOnly yes
EOF
  chmod 600 "$HOME/.ssh/config"
fi

echo ""
echo "=== Add this deploy key to GitHub ==="
echo "Repo → Settings → Deploy keys → Add deploy key"
echo "Title: Hostinger VPS"
echo "Key (paste below):"
echo ""
cat "${KEY}.pub"
echo ""
echo "=== Test GitHub SSH ==="
ssh -T git@github.com || true

if [ -d "$APP_DIR/.git" ]; then
  echo "=== Updating existing repo at $APP_DIR ==="
  cd "$APP_DIR"
  git remote set-url origin "$REPO"
  git fetch origin main
  git reset --hard origin/main
else
  echo "=== Cloning into $APP_DIR ==="
  mkdir -p "$(dirname "$APP_DIR")"
  GIT_SSH_COMMAND="ssh -i $KEY -o IdentitiesOnly=yes" git clone "$REPO" "$APP_DIR"
fi

echo ""
echo "Done. Set GitHub Actions secret VPS_APP_DIR=$APP_DIR"
