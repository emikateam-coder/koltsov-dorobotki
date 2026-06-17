# Подготовка VPS

Делается один раз на чистом Ubuntu 22.04/24.04 (или Debian 12). Дальше всё автоматически — workflow `deploy.yml` сам обновляет код, перезапускает контейнеры и держит TLS.

## Требования

- Публичный IP, открытые порты `22`, `80`, `443`.
- Домен (например `mini.example.com`), A-запись которого указывает на IP сервера. Без домена TLS не получишь — Telegram Mini App требует HTTPS.
- ≥ 1 ГБ RAM, ≥ 10 ГБ диска. Минимальной VPS за 4 €/мес обычно хватает.

## Шаги

1. Подключись по SSH под рутом:

   ```bash
   ssh root@SERVER_IP
   ```

2. Создай deploy-пользователя (можно `deploy`):

   ```bash
   adduser --disabled-password --gecos "" deploy
   usermod -aG sudo deploy
   ```

3. Положи свой публичный SSH-ключ:

   ```bash
   mkdir -p /home/deploy/.ssh
   # Вставь сюда тот же публичный ключ, парный к SSH_PRIVATE_KEY из GitHub Secrets.
   echo 'ssh-ed25519 AAAA...' > /home/deploy/.ssh/authorized_keys
   chown -R deploy:deploy /home/deploy/.ssh
   chmod 700 /home/deploy/.ssh
   chmod 600 /home/deploy/.ssh/authorized_keys
   ```

4. Установи Docker и плагин compose:

   ```bash
   apt-get update
   apt-get install -y ca-certificates curl rsync
   install -m 0755 -d /etc/apt/keyrings
   curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
     | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
   chmod a+r /etc/apt/keyrings/docker.gpg
   echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
     https://download.docker.com/linux/ubuntu $(. /etc/os-release; echo "$VERSION_CODENAME") stable" \
     > /etc/apt/sources.list.d/docker.list
   apt-get update
   apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
   ```

5. Дай deploy-пользователю запускать docker без sudo:

   ```bash
   usermod -aG docker deploy
   ```

6. Создай каталог для приложения:

   ```bash
   mkdir -p /opt/tma
   chown -R deploy:deploy /opt/tma
   ```

7. (Опционально) поставь UFW и открой только нужные порты:

   ```bash
   apt-get install -y ufw
   ufw allow 22/tcp
   ufw allow 80/tcp
   ufw allow 443/tcp
   ufw --force enable
   ```

Готово. Дальше всё делает GitHub Actions: rsync кода, генерация `.env`, `docker compose up -d --build`. Caddy сам получит Let's Encrypt сертификат для `DOMAIN` при первом старте.

## Откат / ручное вмешательство

Зайти на сервер можно в любой момент и работать руками:

```bash
ssh deploy@SERVER_IP
cd /opt/tma

# Логи
docker compose logs -f api
docker compose logs -f bot
docker compose logs -f web

# Перезапуск
docker compose restart api

# Полный ребилд (после ручных правок кода/.env)
docker compose up -d --build

# Откат к предыдущему коммиту:
# просто запусти Actions → Deploy → Run workflow на нужном коммите
# (или сделай git revert и push в main).
```

База SQLite живёт в Docker volume `tma_api_data`. Бэкапы:

```bash
# дамп
docker run --rm -v tma_api_data:/data -v "$PWD":/backup alpine \
  sh -c 'cp /data/app.sqlite /backup/app.sqlite.$(date +%F).bak'
```
