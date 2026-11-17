import { createHash, createHmac } from "node:crypto";
import type { R2Config } from "@/lib/backup/config";

export type R2ObjectMeta = {
  key: string;
  size: number;
  lastModified: Date | null;
};

function sha256Hex(data: string | Buffer | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function amzDate(date: Date): { amz: string; day: string } {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amz: iso, day: iso.slice(0, 8) };
}

function encodePath(key: string): string {
  return key
    .split("/")
    .map((part) => encodeURIComponent(part).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`))
    .join("/");
}

function signingKey(secret: string, day: string, region: string, service: string): Buffer {
  const kDate = hmac(`AWS4${secret}`, day);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

async function signedFetch(
  cfg: R2Config,
  method: string,
  pathWithQuery: string,
  body?: Uint8Array | Buffer | null,
  extraHeaders?: Record<string, string>,
): Promise<Response> {
  const url = new URL(pathWithQuery, cfg.endpoint.endsWith("/") ? cfg.endpoint : `${cfg.endpoint}/`);
  const region = "auto";
  const service = "s3";
  const now = new Date();
  const { amz, day } = amzDate(now);
  const payload = body ? Buffer.from(body) : Buffer.alloc(0);
  const payloadHash = sha256Hex(payload);
  const headers: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amz,
    ...(extraHeaders ?? {}),
  };
  if (body && body.byteLength > 0 && !headers["content-type"]) {
    headers["content-type"] = "application/octet-stream";
  }
  if (body) headers["content-length"] = String(payload.byteLength);

  const signedHeaderKeys = Object.keys(headers)
    .map((k) => k.toLowerCase())
    .sort();
  const canonicalHeaders = signedHeaderKeys.map((k) => `${k}:${headers[k]!.trim()}\n`).join("");
  const signedHeaders = signedHeaderKeys.join(";");
  const canonicalQuery = [...url.searchParams.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  const canonicalRequest = [
    method,
    url.pathname || "/",
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope = `${day}/${region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amz, credentialScope, sha256Hex(canonicalRequest)].join("\n");
  const signature = createHmac("sha256", signingKey(cfg.secretAccessKey, day, region, service))
    .update(stringToSign, "utf8")
    .digest("hex");
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return fetch(url, { method, headers, body: body && body.byteLength > 0 ? payload : undefined });
}

export async function r2PutObject(cfg: R2Config, key: string, body: Uint8Array): Promise<void> {
  const path = `/${cfg.bucket}/${encodePath(key)}`;
  const response = await signedFetch(cfg, "PUT", path, body);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`R2 PutObject ${response.status}: ${text.slice(0, 200)}`);
  }
}

export async function r2GetObject(cfg: R2Config, key: string): Promise<Uint8Array> {
  const path = `/${cfg.bucket}/${encodePath(key)}`;
  const response = await signedFetch(cfg, "GET", path);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`R2 GetObject ${response.status}: ${text.slice(0, 200)}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

export async function r2DeleteObject(cfg: R2Config, key: string): Promise<void> {
  const path = `/${cfg.bucket}/${encodePath(key)}`;
  const response = await signedFetch(cfg, "DELETE", path);
  if (!response.ok && response.status !== 204) {
    const text = await response.text().catch(() => "");
    throw new Error(`R2 DeleteObject ${response.status}: ${text.slice(0, 200)}`);
  }
}

export async function r2ListObjects(cfg: R2Config, prefix = ""): Promise<R2ObjectMeta[]> {
  const params = new URLSearchParams({ "list-type": "2", "max-keys": "1000" });
  if (prefix) params.set("prefix", prefix);
  const path = `/${cfg.bucket}?${params.toString()}`;
  const response = await signedFetch(cfg, "GET", path);
  const xml = await response.text();
  if (!response.ok) throw new Error(`R2 ListObjects ${response.status}: ${xml.slice(0, 200)}`);

  const items: R2ObjectMeta[] = [];
  const contents = xml.match(/<Contents>[\s\S]*?<\/Contents>/g) ?? [];
  for (const block of contents) {
    const key = block.match(/<Key>([\s\S]*?)<\/Key>/)?.[1]?.replace(/&amp;/g, "&") ?? "";
    const size = Number(block.match(/<Size>(\d+)<\/Size>/)?.[1] ?? 0);
    const rawMod = block.match(/<LastModified>([\s\S]*?)<\/LastModified>/)?.[1] ?? "";
    const lastModified = rawMod ? new Date(rawMod) : null;
    if (key) items.push({ key, size, lastModified: lastModified && !Number.isNaN(lastModified.getTime()) ? lastModified : null });
  }
  return items;
}
