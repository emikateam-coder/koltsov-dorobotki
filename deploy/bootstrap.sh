#!/usr/bin/env bash
# Одноразовая подготовка свежего Ubuntu 22.04/24.04 (или Debian 12) под этот проект.
#
# Что делает:
#   1. apt update + базовые утилиты (rsync, ca-certificates, curl, gpg, ufw)
#   2. ставит Docker CE + plugin compose из официального репо Docker
#   3. создаёт системного пользователя deploy (если его нет), добавляет в группу docker
#   4. кладёт твой публичный SSH-ключ в /home/deploy/.ssh/authorized_keys
#   5. отключает пароль/root-логин по SSH (опционально, см. SSH_HARDEN)
#   6. поднимает UFW и открывает только 22/80/443
#   7. создаёт /opt/tma с владельцем deploy
#
# Запуск (под root):
#
#   curl -fsSL https://raw.githubusercontent.com/<owner>/<repo>/<branch>/deploy/bootstrap.sh \
#     | sudo DEPLOY_USER=deploy DEPLOY_PATH=/opt/tma SSH_PUB_KEY="ssh-ed25519 AAAA..." bash
#
# или скачать и запустить локально:
#
#   sudo DEPLOY_USER=deploy SSH_PUB_KEY="$(cat ~/.ssh/github_actions.pub)" bash bootstrap.sh

set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-deploy}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/tma}"
SSH_PUB_KEY="${SSH_PUB_KEY:-}"
SSH_HARDEN="${SSH_HARDEN:-0}"   # 1 — отключить пароли и root-вход по SSH
ENABLE_UFW="${ENABLE_UFW:-1}"

if [[ $EUID -ne 0 ]]; then
  echo "Запусти под root (sudo bash bootstrap.sh)." >&2
  exit 1
fi

if [[ -z "$SSH_PUB_KEY" ]]; then
  echo "Передай публичный SSH-ключ в SSH_PUB_KEY (то, что положишь в GitHub Secret SSH_PRIVATE_KEY — это парный приватный ключ)." >&2
  exit 1
fi

OS_ID="$(. /etc/os-release; echo "${ID:-}")"
OS_CODENAME="$(. /etc/os-release; echo "${VERSION_CODENAME:-}")"
case "$OS_ID" in
  ubuntu|debian) ;;
  *)
    echo "Скрипт рассчитан на Ubuntu/Debian, у тебя $OS_ID." >&2
    exit 1
    ;;
esac

echo "==> apt update + базовые пакеты"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg rsync ufw

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Установка Docker CE"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/${OS_ID}/gpg" \
    | gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/${OS_ID} ${OS_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
else
  echo "==> Docker уже установлен ($(docker --version))"
  apt-get install -y docker-compose-plugin || true
fi

if ! id -u "$DEPLOY_USER" >/dev/null 2>&1; then
  echo "==> Создаём пользователя $DEPLOY_USER"
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
else
  echo "==> Пользователь $DEPLOY_USER уже существует"
fi

usermod -aG docker "$DEPLOY_USER"

echo "==> Устанавливаем authorized_keys"
SSH_DIR="/home/$DEPLOY_USER/.ssh"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$SSH_DIR"
AUTH_FILE="$SSH_DIR/authorized_keys"
touch "$AUTH_FILE"
if ! grep -qxF "$SSH_PUB_KEY" "$AUTH_FILE"; then
  echo "$SSH_PUB_KEY" >> "$AUTH_FILE"
fi
chown "$DEPLOY_USER:$DEPLOY_USER" "$AUTH_FILE"
chmod 600 "$AUTH_FILE"

if [[ "$SSH_HARDEN" == "1" ]]; then
  echo "==> Отключаем root и пароли в sshd_config"
  SSHD_DROPIN=/etc/ssh/sshd_config.d/99-tma-harden.conf
  cat > "$SSHD_DROPIN" <<'EOF'
PasswordAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
EOF
  systemctl reload ssh || systemctl reload sshd || true
fi

echo "==> Подготавливаем $DEPLOY_PATH"
install -d -m 755 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$DEPLOY_PATH"

if [[ "$ENABLE_UFW" == "1" ]]; then
  echo "==> Настраиваем UFW (22/80/443)"
  ufw allow OpenSSH || ufw allow 22/tcp
  ufw allow 80/tcp
  ufw allow 443/tcp
  if ! ufw status | grep -q "Status: active"; then
    ufw --force enable
  fi
fi

echo
echo "Готово."
echo "  пользователь:    $DEPLOY_USER"
echo "  каталог проекта: $DEPLOY_PATH"
echo "  docker:          $(docker --version)"
echo "  compose:         $(docker compose version 2>/dev/null | head -1)"
echo
echo "Дальше: положи SSH_HOST/SSH_USER/SSH_PRIVATE_KEY/DOMAIN/BOT_TOKEN/... в GitHub Secrets и запусти Deploy workflow."
