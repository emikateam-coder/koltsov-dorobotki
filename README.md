# Telegram Mini App — стартовый шаблон

Монорепозиторий на pnpm workspaces:

- `apps/web` — фронтенд Mini App (React 18 + Vite + `@telegram-apps/telegram-ui`).
- `apps/api` — backend на Fastify 5 с валидацией `initData` (HMAC-SHA256).
- `apps/bot` — Telegram-бот на grammY (long polling), отправляет кнопку открытия Mini App.
- `packages/shared` — общие zod-схемы и типы (`@app/shared`).

## Установка на macOS

1. Поставь Homebrew (если ещё нет):

   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```

2. Установи nvm и Node 20 LTS:

   ```bash
   brew install nvm
   mkdir -p ~/.nvm
   echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.zshrc
   echo '[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && . "/opt/homebrew/opt/nvm/nvm.sh"' >> ~/.zshrc
   exec zsh
   nvm install 20
   nvm use 20
   ```

3. Установи pnpm:

   ```bash
   corepack enable
   corepack prepare pnpm@latest --activate
   ```

   или:

   ```bash
   brew install pnpm
   ```

4. Установи cloudflared (для HTTPS-туннеля к локальному dev-серверу):

   ```bash
   brew install cloudflared
   ```

5. (Опционально) Docker Desktop, если планируешь упаковывать api/bot в контейнеры:

   ```bash
   brew install --cask docker
   ```

## Первый запуск

1. Создай бота через [@BotFather](https://t.me/BotFather):
   - `/newbot` → задай имя и username, получи `BOT_TOKEN`.
   - `/newapp` (или `/myapps`) → создай Mini App у этого бота, временно укажи любой HTTPS-URL
     (после поднимешь cloudflared и обновишь URL).

2. Скопируй `.env.example` в `.env` в корне репозитория и заполни значения:

   ```bash
   cp .env.example .env
   ```

   - `BOT_TOKEN` — из @BotFather.
   - `WEB_APP_URL` — публичный HTTPS-URL Mini App (cloudflared-туннель в dev, прод-домен в проде).
   - `API_PORT` — порт Fastify (по умолчанию 3001).
   - `API_ALLOWED_ORIGINS` — список origin'ов через запятую, с которых разрешён CORS.
   - `VITE_API_URL` — URL backend для фронта.

   Для фронта продублируй `VITE_API_URL` в `apps/web/.env` (есть `apps/web/.env.example`):

   ```bash
   cp apps/web/.env.example apps/web/.env
   ```

3. Установи зависимости из корня:

   ```bash
   pnpm install
   ```

4. Подними HTTPS-туннель к локальному dev-серверу Vite (порт 5173):

   ```bash
   cloudflared tunnel --url http://localhost:5173
   ```

   Скопируй полученный `https://<random>.trycloudflare.com` URL.

5. Привяжи этот HTTPS-URL к Mini App в @BotFather:
   - `/myapps` → выбери приложение → `Edit Web App URL` → вставь URL из cloudflared.
   - Этот же URL положи в `WEB_APP_URL` в `.env`.

6. Запусти всё параллельно:

   ```bash
   pnpm dev
   ```

   Это поднимет одновременно:
   - `apps/web` на `http://localhost:5173`
   - `apps/api` на `http://localhost:${API_PORT}`
   - `apps/bot` в long polling

   Открой бота в Telegram, отправь `/start`, нажми кнопку — откроется Mini App.

   Отдельные процессы можно запускать так:

   ```bash
   pnpm dev:web
   pnpm dev:api
   pnpm dev:bot
   ```

## Как это работает

1. Telegram открывает Mini App (`apps/web`) внутри встроенного браузера и инжектит
   `window.Telegram.WebApp` со свойством `initData` — подписанной HMAC строкой.
2. Фронт в `apps/web/src/api/client.ts` отправляет `initData` в каждом запросе к backend
   через заголовок `X-Telegram-Init-Data`.
3. `apps/api` в `onRequest`-хуке валидирует подпись:
   - `secret = HMAC_SHA256("WebAppData", BOT_TOKEN)`,
   - `data_check_string` собирается из всех полей кроме `hash`, отсортированных по ключу
     и склеенных через `\n`,
   - вычисленный HMAC сравнивается с `hash` из `initData` через `timingSafeEqual`,
   - проверяется свежесть `auth_date` (по умолчанию не старше 24 часов).
4. На невалидном/отсутствующем `initData` сервер отдаёт `401`. Эндпоинт `/health`
   доступен без проверки.
5. Внутри хендлеров `request.initData.user` уже содержит распарсенного `TelegramUser`
   (типы из `packages/shared`).

## Скрипты

- `pnpm dev` — параллельный запуск web + api + bot.
- `pnpm build` — сборка всех пакетов (Vite для web, tsc для api/bot/shared).
- `pnpm typecheck` — `tsc --noEmit` во всех пакетах.
- `pnpm format` / `pnpm format:check` — Prettier.

## Деплой на свой VPS через GitHub Actions

Архитектура: один сервер с Docker, всё крутится в Compose. Caddy на 80/443 сам получает Let's Encrypt сертификат и:

- отдаёт собранную статику `apps/web` на корне домена;
- проксирует `/me`, `/events*`, `/health` в контейнер `api` (то есть фронт и API на одном origin, CORS не нужен);
- бот `apps/bot` живёт отдельным контейнером в long polling.

Workflows в `.github/workflows/`:

- `ci.yml` — typecheck + build на каждый push/PR в `main`.
- `deploy.yml` — на каждый push в `main` (или вручную) делает rsync исходников на VPS, кладёт `.env` из GitHub Secrets и запускает `docker compose up -d --build`.

### 1. Подготовь сервер

Один раз — см. подробный гайд [`deploy/server-setup.md`](deploy/server-setup.md). Кратко:

- Поставь Docker + плагин compose.
- Создай deploy-пользователя, добавь в группу `docker`, положи публичный SSH-ключ в `~/.ssh/authorized_keys`.
- Создай `/opt/tma` с владельцем deploy.
- Открой 22, 80, 443.
- Настрой A-запись домена (`mini.example.com`) на IP сервера.

### 2. Сгенерируй SSH-ключ для CI

На своей машине:

```bash
ssh-keygen -t ed25519 -f deploy_key -N "" -C "github-actions"
# deploy_key.pub → /home/deploy/.ssh/authorized_keys на сервере
# deploy_key      → GitHub Secrets как SSH_PRIVATE_KEY
```

### 3. Положи секреты в GitHub

`Settings → Secrets and variables → Actions → New repository secret`:

| Имя | Обязательно | Что |
| --- | --- | --- |
| `SSH_HOST` | да | IP или DNS сервера, например `203.0.113.10` или `mini.example.com` |
| `SSH_USER` | да | пользователь, под которым деплоим (например `deploy`) |
| `SSH_PRIVATE_KEY` | да | приватный ключ (вместе со строками `-----BEGIN`/`END`) |
| `SSH_PORT` | нет | порт ssh, по умолчанию `22` |
| `DEPLOY_PATH` | нет | каталог на сервере, по умолчанию `/opt/tma` |
| `DOMAIN` | да | домен с TLS, например `mini.example.com` |
| `ACME_EMAIL` | нет | email для Let's Encrypt, по умолчанию `admin@$DOMAIN` |
| `BOT_TOKEN` | да | токен из @BotFather |
| `ORGANIZER_TELEGRAM_IDS` | нет | id организаторов через запятую (`123,456`) |
| `GOOGLE_SHEET_ID` | нет | ID Google-таблицы (если хочешь экспорт записей) |
| `GOOGLE_SHEET_NAME` | нет | имя листа, по умолчанию `Registrations` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | нет | содержимое JSON сервис-аккаунта (одной строкой) |

Workflow сам сложит из них корректный `.env` на сервере и подставит:

- `WEB_APP_URL=https://$DOMAIN/`
- `API_ALLOWED_ORIGINS=https://$DOMAIN`

### 4. Привяжи бота к Mini App

В [@BotFather](https://t.me/BotFather):

1. `/newbot` → имя/username → получи `BOT_TOKEN` → положи в GitHub Secrets.
2. `/newapp` → выбери бота → задай Web App URL = `https://$DOMAIN/`.

### 5. Запусти

`Actions → Deploy → Run workflow` (или просто пуш в `main`). Через 1–3 минуты:

- Caddy получит сертификат и Mini App откроется на `https://$DOMAIN/`.
- Бот ответит на `/start` кнопкой запуска приложения.

Логи и ручные команды — в [`deploy/server-setup.md`](deploy/server-setup.md).

### Локальный prod-прогон

На своей машине (с docker), создай `.env` рядом с `docker-compose.yml`:

```bash
cp .env.example .env
# заполни DOMAIN=localhost (без TLS), BOT_TOKEN=..., и т.д.
docker compose up --build
```

Caddy без публичного домена будет слушать по HTTP — для Telegram это не подойдёт, но проверить, что всё собирается, удобно.

## Что умеет приложение: запись на события

Стартовый функционал — система записи на мероприятия с двумя ролями.

### Роли

- **Организатор**. Telegram user ID, перечисленные через запятую в `ORGANIZER_TELEGRAM_IDS` в `.env`. Может:
  - создавать события (название, описание, место, дата/время, вместимость);
  - редактировать и удалять свои события;
  - видеть список всех записавшихся на событие (имя, username, Telegram ID).
- **Участник**. Любой пользователь, открывший Mini App. Может:
  - смотреть список ближайших событий;
  - открывать карточку события и записываться;
  - отменять свою запись.

### Эндпоинты `apps/api`

- `GET /me` — данные пользователя + флаг `isOrganizer`.
- `GET /events` — список ближайших событий (с пометкой `isRegistered` и счётчиком записей). Параметр `?all=1` (только для организатора) возвращает в том числе прошедшие.
- `GET /events/:id` — карточка события.
- `POST /events`, `PATCH /events/:id`, `DELETE /events/:id` — только организатор.
- `POST /events/:id/register` — записаться. Защищено `UNIQUE(event_id, user_id)` и проверкой вместимости в транзакции.
- `DELETE /events/:id/register` — отменить запись.
- `GET /events/:id/registrations` — список записавшихся (только организатор).

### Хранилище

SQLite (`better-sqlite3`), файл `data/app.sqlite` создаётся автоматически. Схема:

- `events(id, title, description, location, starts_at, capacity, organizer_id, created_at, updated_at)`;
- `registrations(id, event_id, user_id, first_name, last_name, username, language_code, photo_url, created_at)` с `UNIQUE(event_id, user_id)` и `ON DELETE CASCADE` от `events.id`.

В шапке `apps/api/src/lib/db.ts` есть `db.exec(...)` с `CREATE TABLE IF NOT EXISTS` — расширять схему можно прямо там.

### Выгрузка записей в Google Sheets (опционально)

При каждой записи и отмене бэкенд может добавлять строку в Google Таблицу — удобно для оффлайн-просмотра, отчётов и шеринга команде. Делается через Service Account, токены не нужны.

**Настройка:**

1. **Service Account.** Зайди в Google Cloud Console (`https://console.cloud.google.com/`), создай или выбери проект.
   - `APIs & Services` → `Library` → найди `Google Sheets API` → `Enable`.
   - `APIs & Services` → `Credentials` → `Create credentials` → `Service account`.
   - Имя любое (например, `mini-app-sheets`), роли можно не назначать.
   - У созданного аккаунта в разделе `Keys` нажми `Add key` → `Create new key` → `JSON`. Скачается файл вида `project-name-12345.json`.
2. **Положи ключ в проект.** Например, в корень репо как `service-account.json` (он в `.gitignore`, не закоммитится). Запомни путь.
3. **Создай таблицу.** В Google Sheets → новая пустая таблица. Имя любое.
   - Скопируй её **ID** из URL: `https://docs.google.com/spreadsheets/d/THIS_IS_ID/edit#gid=0`.
   - В верхнем правом углу `Share` → вставь email сервис-аккаунта (он есть в JSON в поле `client_email`, например `mini-app-sheets@project.iam.gserviceaccount.com`) → дай роль `Editor`.
4. **Заполни `.env`** в корне репо:
   ```
   GOOGLE_SHEET_ID=ID_таблицы_из_URL
   GOOGLE_SHEET_NAME=Registrations
   GOOGLE_SERVICE_ACCOUNT_FILE=./service-account.json
   ```
5. Перезапусти `pnpm dev`. В логе api появится `Google Sheets export enabled`.

При первой записи бэкенд автоматически создаст лист `Registrations` (если его нет), пропишет шапку и начнёт добавлять строки. Структура:

| Время | ID события | Событие | Когда | Место | Действие | Бронь № | Мест | Имя | Фамилия | Username | Telegram ID |

`Действие` — это `Запись` или `Отмена`. История append-only, ничего не перезаписывается, удобно для аудита.

**В прод (Railway/Render).** Файл туда залить нельзя, поэтому используй переменную `GOOGLE_SERVICE_ACCOUNT_JSON` — положи в неё содержимое `service-account.json` одной строкой (заменив переводы `\n` в `private_key`):
```
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\\n...","client_email":"..."}
```

Если переменные не заполнены — выгрузка просто отключается, основной функционал работает без изменений.

### Как стать организатором

1. Узнай свой Telegram user ID (он появится в Mini App в разделе «Профиль» → «ID», либо у бота `@userinfobot`).
2. В корневом `.env` добавь:
   ```
   ORGANIZER_TELEGRAM_IDS=твой_id,второй_id
   ```
3. Перезапусти `pnpm dev`.
4. На главной появится кнопка «Создать событие», а на карточке события — список записавшихся.

## Структура

```
.
├── apps/
│   ├── api/      Fastify + initData validation + SQLite (events, registrations)
│   ├── bot/      grammY long-polling bot
│   └── web/      React + Vite Mini App (события + запись)
├── packages/
│   └── shared/   zod-схемы и типы (@app/shared)
├── data/         SQLite-файл (создаётся автоматически, в .gitignore)
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```
