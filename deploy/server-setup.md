# Подготовка VPS

Делается один раз на чистом Ubuntu 22.04/24.04 (или Debian 12). Дальше всё автоматически — workflow `deploy.yml` сам обновляет код, перезапускает контейнеры и держит TLS.

## Требования

- Публичный IP, открытые порты `22`, `80`, `443`.
- Домен (например `mini.example.com`) с A-записью на IP сервера. Без домена TLS не получишь — Telegram Mini App требует HTTPS.
- ≥ 1 ГБ RAM, ≥ 10 ГБ диска. Минимальной VPS за 4 €/мес обычно хватает.

## DNS A-запись (делается один раз в админке твоего регистратора)

Где именно — зависит от того, у кого куплен домен:

- **Reg.ru / Рег.ру** → DNS-серверы и зона → Управление DNS → Добавить запись A.
- **Cloudflare** → твой домен → DNS → Add record → Type A.
- **Namecheap** → Domain List → Manage → Advanced DNS → Add new record → A Record.
- **GoDaddy** → My Products → DNS → Add → A.
- **Reg.com / Beget / Timeweb / SprintHost** — похожий пункт «DNS-записи / Управление зоной».

В записи указываешь:

| Поле | Значение |
| --- | --- |
| Type | `A` |
| Host / Subdomain | `mini` (если хочешь `mini.example.com`) или `@` (если хочешь корневой `example.com`) |
| Value / Points to | публичный IP сервера, например `203.0.113.10` |
| TTL | минимально допустимый (300 с / 1 минута) |

Проверка через 1–10 минут:

```bash
dig +short mini.example.com   # должен вернуть твой IP
```

## Установка Docker, deploy-пользователя и фаервола одной командой

В репозитории есть скрипт [`deploy/bootstrap.sh`](bootstrap.sh), который делает всё сразу:

- ставит Docker CE + плагин compose из официального репозитория;
- создаёт пользователя `deploy`, добавляет его в группу `docker`;
- кладёт твой публичный SSH-ключ в `/home/deploy/.ssh/authorized_keys`;
- (опционально) отключает root и парольную аутентификацию в SSH;
- настраивает UFW и открывает только 22/80/443;
- создаёт `/opt/tma` с владельцем `deploy`.

### Шаг 1. Сгенерируй SSH-ключ для GitHub Actions

На своей машине:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github_actions_tma -N "" -C "github-actions"
# приватный ключ ~/.ssh/github_actions_tma → потом в GitHub Secret SSH_PRIVATE_KEY
# публичный ключ ~/.ssh/github_actions_tma.pub → его передаём в bootstrap
```

### Шаг 2. Запусти bootstrap на сервере

Подключись по SSH под рутом (как именно — зависит от провайдера; обычно root-пароль присылают на email после создания VPS):

```bash
ssh root@SERVER_IP
```

Дальше один из двух способов.

**A. Скачать и запустить из ветки в репо:**

```bash
curl -fsSL https://raw.githubusercontent.com/<OWNER>/<REPO>/<BRANCH>/deploy/bootstrap.sh \
  | DEPLOY_USER=deploy \
    SSH_PUB_KEY="ssh-ed25519 AAAA...твой публичный ключ..." \
    bash
```

**B. Скопировать вручную:**

```bash
# на своей машине:
scp deploy/bootstrap.sh root@SERVER_IP:/tmp/

# на сервере:
DEPLOY_USER=deploy \
SSH_PUB_KEY="$(cat /tmp/github_actions_tma.pub)" \
bash /tmp/bootstrap.sh
```

Опции (через ENV):

| Переменная | По умолчанию | Что |
| --- | --- | --- |
| `DEPLOY_USER` | `deploy` | имя пользователя для деплоя |
| `DEPLOY_PATH` | `/opt/tma` | каталог проекта |
| `SSH_PUB_KEY` | — *(обязательно)* | публичный ключ, парный к GitHub Secret `SSH_PRIVATE_KEY` |
| `SSH_HARDEN` | `0` | `1` — отключить пароли и root в sshd |
| `ENABLE_UFW` | `1` | `0` — не трогать фаервол |

### Шаг 3. Проверь подключение

С твоей машины:

```bash
ssh -i ~/.ssh/github_actions_tma deploy@SERVER_IP "docker --version && docker compose version"
```

Должно вернуть версии Docker и Compose.

### Шаг 4. Дальше — GitHub

Положи в `Settings → Secrets and variables → Actions`:

- `SSH_HOST` = IP сервера (или DNS, например `mini.example.com`)
- `SSH_USER` = `deploy`
- `SSH_PRIVATE_KEY` = содержимое `~/.ssh/github_actions_tma` (с `-----BEGIN/END-----`)
- `DOMAIN` = `mini.example.com`
- `BOT_TOKEN` = из @BotFather
- остальные опциональные — см. README

`Actions → Deploy → Run workflow`. Caddy сам поднимет TLS для `DOMAIN`.

## Откат / ручные операции

Зайти на сервер можно в любой момент и работать руками:

```bash
ssh deploy@SERVER_IP
cd /opt/tma

docker compose logs -f api
docker compose logs -f bot
docker compose logs -f web

docker compose restart api
docker compose up -d --build
```

База SQLite живёт в Docker volume `tma_api_data`. Бэкап:

```bash
docker run --rm -v tma_api_data:/data -v "$PWD":/backup alpine \
  sh -c 'cp /data/app.sqlite /backup/app.sqlite.$(date +%F).bak'
```
