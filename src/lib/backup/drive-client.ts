import { createSign } from "node:crypto";
import type { DriveBackupConfig } from "@/lib/backup/config";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";

type ServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

export type DriveFileMeta = {
  id: string;
  name: string;
  size: number;
  modifiedTime: Date | null;
};

function parseServiceAccount(json: string): ServiceAccount {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON: невалидный JSON");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON: ожидался объект");
  const row = parsed as Record<string, unknown>;
  const client_email = String(row.client_email ?? "").trim();
  const private_key = String(row.private_key ?? "").replace(/\\n/g, "\n");
  if (!client_email || !private_key) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON: нужны client_email и private_key");
  return { client_email, private_key, token_uri: typeof row.token_uri === "string" ? row.token_uri : TOKEN_URL };
}

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function signJwt(sa: ServiceAccount, nowSec = Math.floor(Date.now() / 1000)): string {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: DRIVE_SCOPE,
      aud: sa.token_uri || TOKEN_URL,
      iat: nowSec,
      exp: nowSec + 3600,
    }),
  );
  const unsigned = `${header}.${claim}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = base64url(signer.sign(sa.private_key));
  return `${unsigned}.${signature}`;
}

let cachedToken: { value: string; exp: number; email: string } | null = null;

export async function getDriveAccessToken(cfg: DriveBackupConfig): Promise<string> {
  const sa = parseServiceAccount(cfg.serviceAccountJson);
  if (cachedToken && cachedToken.email === sa.client_email && cachedToken.exp > Date.now() + 60_000) {
    return cachedToken.value;
  }
  const assertion = signJwt(sa);
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });
  const response = await fetch(sa.token_uri || TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await response.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!response.ok || !data.access_token) {
    throw new Error(`Drive token: ${data.error ?? response.status}`);
  }
  const expiresIn = Number(data.expires_in ?? 3600);
  cachedToken = {
    value: data.access_token,
    exp: Date.now() + expiresIn * 1000,
    email: sa.client_email,
  };
  return data.access_token;
}

/** Сброс кеша токена (тесты). */
export function clearDriveTokenCache(): void {
  cachedToken = null;
}

export async function driveUploadFile(
  cfg: DriveBackupConfig,
  name: string,
  bytes: Uint8Array,
): Promise<DriveFileMeta> {
  const token = await getDriveAccessToken(cfg);
  const metadata = JSON.stringify({
    name,
    parents: [cfg.folderId],
  });
  const boundary = `ledbackup_${Date.now()}`;
  const preamble = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`,
    "utf8",
  );
  const closing = Buffer.from(`\r\n--${boundary}--`, "utf8");
  const body = Buffer.concat([preamble, Buffer.from(bytes), closing]);
  const response = await fetch(`${DRIVE_FILES}?uploadType=multipart&fields=id,name,size,modifiedTime`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  const data = (await response.json()) as {
    id?: string;
    name?: string;
    size?: string;
    modifiedTime?: string;
    error?: { message?: string };
  };
  if (!response.ok || !data.id) {
    throw new Error(`Drive upload: ${data.error?.message ?? response.status}`);
  }
  return {
    id: data.id,
    name: data.name ?? name,
    size: Number(data.size ?? bytes.byteLength),
    modifiedTime: data.modifiedTime ? new Date(data.modifiedTime) : null,
  };
}

export async function driveListBackupFiles(cfg: DriveBackupConfig): Promise<DriveFileMeta[]> {
  const token = await getDriveAccessToken(cfg);
  const q = `'${cfg.folderId.replace(/'/g, "\\'")}' in parents and trashed = false and name contains 'ledvision.dump'`;
  const params = new URLSearchParams({
    q,
    fields: "files(id,name,size,modifiedTime)",
    pageSize: "100",
    orderBy: "modifiedTime desc",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  const response = await fetch(`${DRIVE_FILES}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await response.json()) as {
    files?: { id: string; name: string; size?: string; modifiedTime?: string }[];
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(`Drive list: ${data.error?.message ?? response.status}`);
  return (data.files ?? []).map((file) => ({
    id: file.id,
    name: file.name,
    size: Number(file.size ?? 0),
    modifiedTime: file.modifiedTime ? new Date(file.modifiedTime) : null,
  }));
}

export async function driveDownloadFile(cfg: DriveBackupConfig, fileId: string): Promise<Uint8Array> {
  const token = await getDriveAccessToken(cfg);
  const response = await fetch(`${DRIVE_FILES}/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Drive download ${response.status}: ${text.slice(0, 200)}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

export async function driveDeleteFile(cfg: DriveBackupConfig, fileId: string): Promise<void> {
  const token = await getDriveAccessToken(cfg);
  const response = await fetch(`${DRIVE_FILES}/${encodeURIComponent(fileId)}?supportsAllDrives=true`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok && response.status !== 204) {
    const text = await response.text().catch(() => "");
    throw new Error(`Drive delete ${response.status}: ${text.slice(0, 200)}`);
  }
}
