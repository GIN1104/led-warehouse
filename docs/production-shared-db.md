# Production: shared DB = **Turso** + **API host**

**Цель (prod):** Oracle Cloud Always Free VM (Fly trial ended).  
**Временно (cold start OK):** Render Free — [`../render.yaml`](../render.yaml) + [`render-free-api.md`](./render-free-api.md).  
Oracle: [`../deploy/oracle/README.md`](../deploy/oracle/README.md) + Project runbook `oracle-always-free-api.md`.

**Команда открывает Pages или API host — данные одни и те же** (весь ledger). Source of truth = Turso `ledvision` на API host; клиент синхронизирует через `/api/v1/ledger`.

| Клиент | Как видит данные |
|--------|------------------|
| **API host** (Render временно / Oracle цель) | same-origin API, `NEXT_PUBLIC_SHARED=1` |
| **Pages** https://gin1104.github.io/led-warehouse/ | `NEXT_PUBLIC_ACCESS_API_BASE` → ledger API (не IndexedDB) |
| Телефон / ПК | любой из двух URL — один Turso ledger |

`fly.toml` оставлен исторически; app на Fly сейчас недоступен без карты.

## Credentials (не в git)

| Secret | Где |
|--------|-----|
| `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` | Render Environment **или** `deploy/oracle/.env` на VM + локальный `.env.local` |
| DB name | `ledvision` |

## Oracle API host

```bash
cd deploy/oracle
cp .env.example .env   # API_DOMAIN + TURSO_* только на VM
docker compose up -d --build
curl -sS https://<API_DOMAIN>/api/v1/health/
# → shared + tursoConfigured
```

CORS: `https://gin1104.github.io` (+ localhost). Ledger GET/PUT и revision отдают `Access-Control-Expose-Headers: X-Revision`.

## Pages → весь ledger

1. Repo Variable: `NEXT_PUBLIC_ACCESS_API_BASE=https://<API_DOMAIN>`
2. `pages.yml` + `scripts/export-build.mjs` пекут URL в static bundle.
3. После merge / workflow_dispatch → GitHub Pages rebuild.
4. Клиент: `openSharedDb` / `pushSharedDb` → `{ACCESS_API_BASE}/api/v1/ledger/`.
5. После успешного sync клиент сохраняет снимок (revision + bytes) в IndexedDB (+ meta в localStorage). Если API/Turso недоступны — last-known snapshot (browse-only) **или**, если снимка нет, soft-disable shared → локальный IndexedDB (пустой/seed), как раньше без ACCESS_API_BASE. Poll вернёт shared, когда API оживёт.

Без Variable/ACCESS_API_BASE Pages = IndexedDB per-browser (демо без shared API).

## Локальный Docker

```bash
NEXT_PUBLIC_SHARED=1
TURSO_DATABASE_URL=…  TURSO_AUTH_TOKEN=…   # из .env.local
docker compose up --build
```

Или production-схема: `deploy/oracle` (порт 8080 + Caddy).

Mock без облака: `TURSO_DATABASE_URL=file:./data/turso-mock.db`.

## Бэкапы Google Drive

Daily/on-demand dump ledger → Google Drive (без Cloudflare R2). Restore только для `starchenkogin@gmail.com` на `/me`. Runbook: [`backup-restore.md`](./backup-restore.md).

См. [`email-auth.md`](./email-auth.md), README § «Где общий учёт».
