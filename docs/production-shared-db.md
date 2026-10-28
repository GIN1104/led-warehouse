# Production: общий склад (shared DB)

**Pages** ([https://GIN1104.github.io/led-warehouse/](https://GIN1104.github.io/led-warehouse/)) — демо: у каждого браузера своя IndexedDB. Для команды это **не** production.

**Production default** — один сервер Next.js + один файл SQLite (или Turso), который видят все браузеры.

## Вариант A — Docker + локальный SQLite (рекомендуемый старт)

```bash
# в корне репозитория
mkdir -p data
docker compose up --build
```

- UI: http://localhost:3000  
- Файл: `./data/warehouse.sqlite` (в контейнере `/data/warehouse.sqlite`, env `LEDGER_PATH`)  
- Перенос на другой ПК: скопируйте проект **вместе с `data/`**, снова `docker compose up`.

Без Docker:

```bash
cp .env.example .env.local   # при необходимости
npm install
npm run dev                  # пишет в data/warehouse.sqlite
```

## Вариант B — Turso (облачный SQLite)

Когда нужен общий склад без VPN/одного ПК:

```bash
turso db create led-warehouse
turso db show led-warehouse --url
turso db tokens create led-warehouse
```

В `.env.local` (или в `docker-compose` environment):

```
TURSO_DATABASE_URL=libsql://…
TURSO_AUTH_TOKEN=…
```

Сервер при старте синхронизирует локальный файл с Turso; запись склада уходит туда же. Токен **только на сервере**, не в статическом Pages.

## Что выбирать

| Сценарий | Путь |
|----------|------|
| Демо / GitHub Pages | IndexedDB, без общего файла |
| Команда в одном офисе / один VPS | **Docker + `data/`** |
| Удалённая команда без своего сервера БД | **Turso** + `npm run dev` или Docker |

Mapper, Google Drive (`ДД-ММ-ГГГГ`), allowlist и роли работают одинаково; меняется только то, **где лежит ledger**.

См. также README § «Где общий учёт», [`email-auth.md`](./email-auth.md).
