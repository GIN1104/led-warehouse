@echo off
REM Windows: daily backup via Fly API (или локальный npm start на :8080)
REM Задайте BACKUP_API_URL, BACKUP_CRON_SECRET; Drive secrets — на сервере.
cd /d "%~dp0.."
node scripts\backup-to-drive.mjs %*
