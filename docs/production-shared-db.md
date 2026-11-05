# Production: shared DB = **Turso** (+ API host)

**Pages** ([https://GIN1104.github.io/led-warehouse/](https://GIN1104.github.io/led-warehouse/)) — static demo: IndexedDB per browser. Заявки на доступ **не** шарятся между устройствами, пока Pages не бьёт в живой API host.

Команда выбрала **Turso** как общую БД. Код уже умеет sync (`src/lib/db/turso.ts` + `file-store.ts`). Credentials только на **Node-сервере** (Docker / `npm start`), не в статике Pages.

## Что уже в коде

| Часть | Статус |
|-------|--------|
| `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` | `tursoConfig()`; без них Turso выкл. |
| Sync | `alignWithRemote` / push / replay на каждой записи ledger |
| Mock без секретов | `TURSO_DATABASE_URL=file:./data/turso-mock.db` (token не нужен) |
| Docker | `docker-compose.yml` прокидывает `TURSO_*`; image с `NEXT_PUBLIC_SHARED=1` |
| Access API | `/api/v1/access-requests` (+ decide), CORS для Pages origin |
| Health | `GET /api/v1/health` → `{ shared, tursoConfigured }` |
| Pages → API | `NEXT_PUBLIC_ACCESS_API_BASE=https://<api-host>` |

## 1. Turso DB `ledvision`

Имя базы у команды: **`ledvision`** (создана Evgeny). URL и token — только в `.env.local` / secrets хоста, **не в git**.

```bash
turso auth login
# уже есть: turso db show ledvision --url
turso db tokens create ledvision
```

Secrets (не коммитить): `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`.

## 2. `.env.local` на API host

```
NEXT_PUBLIC_SHARED=1
TURSO_DATABASE_URL=libsql://ledvision-….turso.io
TURSO_AUTH_TOKEN=eyJ…
```

Mock: `TURSO_DATABASE_URL=file:./data/turso-mock.db`.  
Проверка: `curl -s http://localhost:3000/api/v1/health/` → `tursoConfigured: true`.

## 3. API host: Fly.io (выбрано командой)

App: `led-warehouse-api`, region `lhr` (рядом с Turso `aws-eu-west-1`). Config: `fly.toml` + `Dockerfile` (`NEXT_PUBLIC_SHARED=1`, port 8080).

```bash
# secrets — только на Fly, не в git
fly secrets set \
  TURSO_DATABASE_URL='libsql://…' \
  TURSO_AUTH_TOKEN='…'

fly deploy
# HTTPS: https://led-warehouse-api.fly.dev
curl -sS https://led-warehouse-api.fly.dev/api/v1/health/
# → {"ok":true,"shared":true,"tursoConfigured":true,…}
```

Локальный volume `/data` на Fly = cache; source of truth = Turso `ledvision`.  
CORS: `https://gin1104.github.io` + localhost; доп. — `ACCESS_CORS_ORIGINS`.

Локальный Docker (dev):

```bash
mkdir -p data
export TURSO_DATABASE_URL='…' TURSO_AUTH_TOKEN='…'   # из .env.local
docker compose up --build -d
```

## 4. Pages → заявки (`NEXT_PUBLIC_ACCESS_API_BASE`)

1. Fly host жив (шаг 3).  
2. В `.github/workflows/pages.yml` (env у `build:pages`) добавить:  
   `NEXT_PUBLIC_ACCESS_API_BASE: ${{ vars.NEXT_PUBLIC_ACCESS_API_BASE }}`  
3. GitHub repo **Settings → Variables** →  
   `NEXT_PUBLIC_ACCESS_API_BASE` = `https://led-warehouse-api.fly.dev`  
   (без trailing slash; подставьте фактический URL из `fly status`).  
4. Пересобрать Pages (push на `main` или workflow_dispatch).  
   Заявки → `{ACCESS_API_BASE}/api/v1/access-requests/`.

Или вся команда ходит только на Fly URL — тогда Variable не нужна.

## Сценарии

| Сценарий | Путь |
|----------|------|
| Демо Pages alone | IndexedDB |
| **Команда** | **Turso + Docker/API host** |
| Pages + общие заявки | host + `NEXT_PUBLIC_ACCESS_API_BASE` |
| Dev без секретов | `file:` mock |

Optional: `TELEGRAM_BOT_TOKEN` / `TELEGRAM_ADMIN_CHAT_IDS` для notify. Sheets mirror — не БД (см. peer-transfers docs).

См. [`email-auth.md`](./email-auth.md), README § «Где общий учёт».
