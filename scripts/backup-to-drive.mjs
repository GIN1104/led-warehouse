#!/usr/bin/env node
/**
 * Daily / on-demand backup ledger → Google Drive.
 *
 * Вариант A (рекомендуется на Fly): POST на API с BACKUP_CRON_SECRET
 *   set BACKUP_API_URL=https://led-warehouse-api.fly.dev
 *   set BACKUP_CRON_SECRET=…
 *   node scripts/backup-to-drive.mjs
 *
 * Вариант B: локальный API (npm start на :8080)
 *
 * Drive secrets на сервере:
 *   GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_DRIVE_BACKUP_FOLDER_ID
 *
 * Cloudflare R2 не используется.
 */

const apiBase = (process.env.BACKUP_API_URL || process.env.FLY_API_URL || "http://127.0.0.1:8080").replace(
  /\/$/,
  "",
);
const secret = (process.env.BACKUP_CRON_SECRET || "").trim();

const url = `${apiBase}/api/v1/backups/`;
const headers = { "Content-Type": "application/json" };
if (secret) headers.Authorization = `Bearer ${secret}`;

const body = {};
if (!secret && process.env.BACKUP_ACTOR_EMAIL) {
  body.actorEmail = process.env.BACKUP_ACTOR_EMAIL;
  headers["X-Actor-Email"] = process.env.BACKUP_ACTOR_EMAIL;
}

const response = await fetch(url, {
  method: "POST",
  headers,
  body: JSON.stringify(body),
});
const text = await response.text();
let data;
try {
  data = JSON.parse(text);
} catch {
  data = { raw: text };
}
if (!response.ok) {
  console.error("backup failed", response.status, data);
  process.exit(1);
}
console.log(JSON.stringify(data, null, 2));
