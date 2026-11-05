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

## 1. Создать Turso DB

```bash
turso auth login
turso db create led-warehouse
turso db show led-warehouse --url
turso db tokens create led-warehouse
```

Нужны два secret (не в git): `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`.

## 2. `.env.local` на API host

```
NEXT_PUBLIC_SHARED=1
TURSO_DATABASE_URL=libsql://led-warehouse-….turso.io
TURSO_AUTH_TOKEN=eyJ…
```

Mock: `TURSO_DATABASE_URL=file:./data/turso-mock.db`.  
Проверка: `curl -s http://localhost:3000/api/v1/health/` → `tursoConfigured: true`.

## 3. Docker API host

```bash
mkdir -p data
export TURSO_DATABASE_URL='libsql://…'
export TURSO_AUTH_TOKEN='…'
docker compose up --build -d
```

`./data/warehouse.sqlite` = локальный cache; при Turso source of truth = облако.  
CORS: `https://gin1104.github.io` + localhost; доп. — `ACCESS_CORS_ORIGINS`.

## 4. Pages → заявки

1. Задеплоить API host с Turso.  
2. В `.github/workflows/pages.yml` (build env) добавить:  
   `NEXT_PUBLIC_ACCESS_API_BASE: ${{ vars.NEXT_PUBLIC_ACCESS_API_BASE }}`  
3. Repo **Variable** `NEXT_PUBLIC_ACCESS_API_BASE=https://api.example.com`  
4. Пересобрать Pages. Заявки → `{ACCESS_API_BASE}/api/v1/access-requests/`.

Или вся команда ходит только на API host — тогда `ACCESS_API_BASE` не нужен.

## Сценарии

| Сценарий | Путь |
|----------|------|
| Демо Pages alone | IndexedDB |
| **Команда** | **Turso + Docker/API host** |
| Pages + общие заявки | host + `NEXT_PUBLIC_ACCESS_API_BASE` |
| Dev без секретов | `file:` mock |

Optional: `TELEGRAM_BOT_TOKEN` / `TELEGRAM_ADMIN_CHAT_IDS` для notify. Sheets mirror — не БД (см. peer-transfers docs).

См. [`email-auth.md`](./email-auth.md), README § «Где общий учёт».
