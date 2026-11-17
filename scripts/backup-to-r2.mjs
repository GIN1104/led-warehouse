#!/usr/bin/env node
/**
 * Daily / on-demand backup ledger → Cloudflare R2 и/или Google Drive.
 *
 * Вариант A (рекомендуется на Fly): POST на API с BACKUP_CRON_SECRET
 *   set BACKUP_API_URL=https://led-warehouse-api.fly.dev
 *   set BACKUP_CRON_SECRET=…
 *   node scripts/backup-to-r2.mjs
 *
 * Вариант B (Windows / локально без API): нужны TURSO или LEDGER_PATH —
 *   скрипт дергает same-origin API если BACKUP_API_URL пуст → http://127.0.0.1:8080
 *
 * R2: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 * Drive: GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_DRIVE_BACKUP_FOLDER_ID
 *
 * Evgeny: bucket R2 и папку Drive создаёте вы в Cloudflare / Google —
 * агент аккаунт Cloudflare создать не может.
 */

const apiBase = (process.env.BACKUP_API_URL || process.env.FLY_API_URL || "http://127.0.0.1:8080").replace(
  /\/$/,
  "",
);
const secret = (process.env.BACKUP_CRON_SECRET || "").trim();
const targets = (process.env.BACKUP_TARGETS || "")
  .split(",")
  .map((s) => s.trim())
  .filter((s) => s === "r2" || s === "drive");

const url = `${apiBase}/api/v1/backups/`;
const headers = { "Content-Type": "application/json" };
if (secret) headers.Authorization = `Bearer ${secret}`;

const body = {};
if (targets.length) body.targets = targets;
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
