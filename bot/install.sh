#!/usr/bin/env bash
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run this installer with sudo: sudo bash bot/install.sh"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BOT_DIR="$ROOT_DIR/bot"

echo "Passport Adventures — Second Life Messenger setup"
echo

read -r -p "Dedicated SL bot username (example: passporthelper): " SL_USERNAME
read -r -s -p "Dedicated SL bot password: " SL_PASSWORD
echo
read -r -p "Bot setup key from Passport Adventures Admin: " BOT_TOKEN

if [[ -z "$SL_USERNAME" || -z "$SL_PASSWORD" || -z "$BOT_TOKEN" ]]; then
  echo "Username, password, and bot setup key are required."
  exit 1
fi

if ! id passportbot >/dev/null 2>&1; then
  useradd --system --home /opt/passport-messenger --shell /usr/sbin/nologin passportbot
fi

mkdir -p /opt/dotnet /opt/passport-messenger/app

if [[ ! -x /opt/dotnet/dotnet ]]; then
  echo "Installing .NET 8 into /opt/dotnet..."
  curl -fsSL https://dot.net/v1/dotnet-install.sh -o /tmp/dotnet-install.sh
  bash /tmp/dotnet-install.sh --channel 8.0 --install-dir /opt/dotnet
fi

echo "Building Passport Messenger..."
/opt/dotnet/dotnet restore "$BOT_DIR/PassportMessenger.csproj"
/opt/dotnet/dotnet publish "$BOT_DIR/PassportMessenger.csproj" -c Release -o /opt/passport-messenger/app --no-restore

cat >/etc/passport-messenger.env <<EOF
SL_USERNAME=$SL_USERNAME
SL_PASSWORD=$SL_PASSWORD
BOT_TOKEN=$BOT_TOKEN
PAYOUT_API=https://tzxlrglgwzinefutledx.supabase.co/functions/v1/payout-push
POLL_SECONDS=20
EOF
chmod 600 /etc/passport-messenger.env
chown root:root /etc/passport-messenger.env

cp "$BOT_DIR/passport-messenger.service" /etc/systemd/system/passport-messenger.service
chown -R passportbot:passportbot /opt/passport-messenger/app

systemctl daemon-reload
systemctl enable --now passport-messenger.service

echo
echo "Installed."
echo "Status:  systemctl status passport-messenger --no-pager"
echo "Logs:    journalctl -u passport-messenger -f"
