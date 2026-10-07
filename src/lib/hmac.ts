import { createHmac, timingSafeEqual } from "node:crypto";

export function signBody(body: string, secret: string): string {
  const hex = createHmac("sha256", secret).update(body).digest("hex");
  return `sha256=${hex}`;
}

export function verifySignature(body: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const expected = signBody(body, secret);
  const actual = header.trim();
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Без секрета локальная разработка принимает вебхук. С секретом подпись обязательна. */
export function isScanAuthorized(body: string, header: string | null, secret: string | undefined): boolean {
  if (!secret) return true;
  return verifySignature(body, header, secret);
}
