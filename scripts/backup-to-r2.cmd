@echo off
REM Windows: daily backup via Fly API (или локальный npm start на :8080)
REM Задайте в окружении BACKUP_API_URL, BACKUP_CRON_SECRET и R2/Drive secrets на сервере.
cd /d "%~dp0.."
node scripts\backup-to-r2.mjs %*
