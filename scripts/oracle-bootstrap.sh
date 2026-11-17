#!/usr/bin/env bash
# Bootstrap Docker на свежей Ubuntu aarch64 (Oracle Always Free).
# Запускать на VM: bash scripts/oracle-bootstrap.sh
set -euo pipefail

if [[ "$(id -u)" -eq 0 ]]; then
  echo "Запустите от обычного пользователя (скрипт сам вызовет sudo)." >&2
  exit 1
fi

echo "==> Docker Engine + Compose plugin"
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"

echo "==> Готово. Выйдите из SSH и зайдите снова, затем:"
echo "    cd deploy/oracle && cp .env.example .env && nano .env"
echo "    docker compose up -d --build"
echo "    curl -fsS https://\$API_DOMAIN/api/v1/health/"
