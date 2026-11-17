# Render Free — временный API host (кратко)

**Статус:** мост до Oracle Always Free VM. Cold start OK.  
**Blueprint:** [`render.yaml`](../render.yaml) · helpers [`deploy/render/`](../deploy/render/).

Полный runbook с кликами (signup, secrets, Pages Variable, откат на Oracle, Zeabur backup):  
Project Context `docs/render-free-api.md`.

## Env (как Fly / Oracle)

| Key | Где |
|-----|-----|
| `NEXT_PUBLIC_SHARED=1` | Blueprint |
| `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` | Render secret |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_ADMIN_CHAT_IDS` | Render secret (опц.) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` / `GOOGLE_DRIVE_BACKUP_FOLDER_ID` | Render secret — папка на **ledvision2026** Drive; иначе `backups.drive:false` + mock |
| `BACKUP_CRON_SECRET` | Render secret (опц., cron/script) |
| CORS | `https://gin1104.github.io` в коде |

Бэкап: [`backup-restore.md`](./backup-restore.md). После secrets: `GET /api/v1/health/` → `backups.drive: true`.

## Pages

GitHub Variable: `NEXT_PUBLIC_ACCESS_API_BASE=https://<service>.onrender.com`  
→ rebuild Pages. **Не** ставить, пока Render URL не проверен.

Имя переменной в проекте — **`NEXT_PUBLIC_ACCESS_API_BASE`** (не `NEXT_PUBLIC_API_URL`).
