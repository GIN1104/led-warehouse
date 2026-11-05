# Production: shared DB = **Turso** + **Fly.io**

**Команда открывает Pages или Fly — данные одни и те же** (весь ledger: заказы, оборудование, заявки). Source of truth = Turso `ledvision` на API host; клиент синхронизирует через `/api/v1/ledger`.

| Клиент | Как видит данные |
|--------|------------------|
| **Fly UI** https://led-warehouse-api.fly.dev | same-origin API, `NEXT_PUBLIC_SHARED=1` |
| **Pages** https://gin1104.github.io/led-warehouse/ | `NEXT_PUBLIC_ACCESS_API_BASE` → Fly ledger API (не IndexedDB) |
| Телефон / ПК | любой из двух URL — один Turso ledger |

## Credentials (не в git)

| Secret | Где |
|--------|-----|
| `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` | Fly secrets + локальный `.env.local` |
| DB name | `ledvision` |

## Fly.io API host

App `led-warehouse-api`, region `lhr`. Config: `fly.toml`, `Dockerfile`.

```bash
fly secrets set TURSO_DATABASE_URL='…' TURSO_AUTH_TOKEN='…'
fly deploy
curl -sS https://led-warehouse-api.fly.dev/api/v1/health/
# → shared + tursoConfigured
```

CORS: `https://gin1104.github.io` (+ localhost). Ledger GET/PUT и revision отдают `Access-Control-Expose-Headers: X-Revision`.

## Pages → весь ledger

1. Repo Variable: `NEXT_PUBLIC_ACCESS_API_BASE=https://led-warehouse-api.fly.dev`
2. `scripts/export-build.mjs` печёт этот URL в static bundle (и включает shared client).
3. После merge в `main` → GitHub Pages rebuild.
4. Клиент: `openSharedDb` / `pushSharedDb` → `{ACCESS_API_BASE}/api/v1/ledger/`.

Без Variable/ACCESS_API_BASE Pages снова был бы IndexedDB per-browser — так больше не для команды.

## Локальный Docker

```bash
NEXT_PUBLIC_SHARED=1
TURSO_DATABASE_URL=…  TURSO_AUTH_TOKEN=…   # из .env.local
docker compose up --build
```

Mock без облака: `TURSO_DATABASE_URL=file:./data/turso-mock.db`.

См. [`email-auth.md`](./email-auth.md), README § «Где общий учёт».
